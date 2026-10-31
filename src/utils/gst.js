/**
 * Company trial fee already includes GST.
 * Longer company plans and extra leads add 18% on top of the list price.
 * The same rounding lives in the frontend gst helper.
 */
export function addGstPaise(basePaise) {
  const base = Math.round(Number(basePaise) || 0);
  const total = Math.round((base * 118) / 100);
  return { basePaise: base, gstPaise: total - base, totalPaise: total };
}

export function chargePaise(userType, basePaise, { gstIncluded = false } = {}) {
  const base = Math.round(Number(basePaise) || 0);
  if (userType !== "company" || gstIncluded) {
    return { basePaise: base, gstPaise: 0, totalPaise: base, gstIncluded: userType === "company" && gstIncluded };
  }
  return { ...addGstPaise(base), gstIncluded: false };
}
