import Coupon from "../models/Coupon.js";
import CouponUse from "../models/CouponUse.js";
import Affiliate from "../models/Affiliate.js";
import AffiliateAttribution from "../models/AffiliateAttribution.js";

export function applyPercent(totalPaise, percent) {
  const rate = Number(percent) || 0;
  if (rate <= 0) return Math.round(totalPaise);
  const next = Math.round((Math.round(totalPaise) * (100 - rate)) / 100);
  return Math.max(100, next);
}

export function couponIsOpen(coupon, now = new Date()) {
  if (!coupon || coupon.active === false) return false;
  if (coupon.startsAt && new Date(coupon.startsAt) > now) return false;
  if (coupon.endsAt && new Date(coupon.endsAt) < now) return false;
  return true;
}

export async function quoteOffer({ code, ref, declineCoupon, userType, userId, totalPaise }) {
  let next = String(code || "").trim();
  if (!next && ref && !declineCoupon) {
    const affiliate = await Affiliate.findOne({ shortCode: String(ref).trim().toLowerCase() });
    if (affiliate && affiliate.linkType !== "referral" && affiliate.coupon) {
      const linked = await Coupon.findById(affiliate.coupon);
      const allowed = linked && (linked.appliesTo === "both" || linked.appliesTo === userType);
      if (linked && couponIsOpen(linked) && allowed) next = linked.code;
    }
  }
  if (!next) {
    return { totalPaise: Math.round(totalPaise), listPaise: Math.round(totalPaise), coupon: null };
  }
  return quoteCoupon({ code: next, userType, userId, totalPaise });
}

export async function quoteCoupon({ code, userType, userId, totalPaise }) {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return { totalPaise, coupon: null };
  const coupon = await Coupon.findOne({ code: clean });
  if (!coupon || !couponIsOpen(coupon)) {
    const error = new Error("This coupon is not available.");
    error.statusCode = 400;
    throw error;
  }
  if (coupon.appliesTo !== "both" && coupon.appliesTo !== userType) {
    const error = new Error("This coupon does not apply to this account.");
    error.statusCode = 400;
    throw error;
  }
  if (userId && coupon.usage !== "repeat") {
    const used = await CouponUse.exists({ coupon: coupon._id, userType, user: userId });
    if (used) {
      const error = new Error("This account has already used this coupon.");
      error.statusCode = 400;
      throw error;
    }
  }
  return {
    coupon,
    code: coupon.code,
    totalPaise: applyPercent(totalPaise, coupon.discountPercent),
    listPaise: Math.round(totalPaise),
  };
}

export async function recordCouponPayment({ payment, user, userType }) {
  if (!payment?.couponCode && !payment?.refCode) return;
  const email = user.email || user.companyEmail || "";
  const name = user.fullName || user.companyName || "";
  const amountPaid = Math.round(Number(payment.amount) || 0) / 100;

  if (payment.couponCode) {
    const coupon = await Coupon.findOne({ code: String(payment.couponCode).toUpperCase() });
    if (coupon) {
      const paymentId = payment.paymentId || payment.orderId || "";
      const fields = {
        coupon: coupon._id,
        code: coupon.code,
        userType,
        user: user._id,
        email,
        name,
        amountPaid,
        paymentId,
        affiliate: coupon.affiliate || null,
      };
      if (coupon.usage === "repeat") {
        const already = paymentId
          ? await CouponUse.exists({ coupon: coupon._id, paymentId })
          : null;
        if (!already) await CouponUse.create(fields);
      } else {
        await CouponUse.updateOne(
          { coupon: coupon._id, userType, user: user._id },
          { $setOnInsert: fields },
          { upsert: true }
        );
      }
    }
  }

  const ref = String(payment.refCode || "").trim().toLowerCase();
  if (!ref) return;
  const affiliate = await Affiliate.findOne({ shortCode: ref });
  if (!affiliate) return;
  await AffiliateAttribution.updateOne(
    { affiliate: affiliate._id, userType, user: user._id },
    {
      $set: {
        shortCode: affiliate.shortCode,
        email,
        name,
        amountPaid,
        couponCode: payment.couponCode || "",
      },
      $setOnInsert: {
        affiliate: affiliate._id,
        userType,
        user: user._id,
      },
    },
    { upsert: true }
  );
}
