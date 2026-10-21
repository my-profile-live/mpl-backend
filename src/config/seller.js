const SUPPLIER_GSTIN = "24AASFN7398A1ZW";
const SUPPLIER_ADDRESS =
  "GF, House No 594, Nishal Faliyu, Mota Varachha Main Road, Mota Varachha, Surat, Surat, Gujarat, 394105";

/** Supplier details printed on every tax invoice. */
export function sellerProfile() {
  const gstin = String(process.env.MPL_GSTIN || SUPPLIER_GSTIN).trim().toUpperCase();
  return {
    legalName: process.env.MPL_LEGAL_NAME || "NILKANTH ENTERPRISE",
    tradeName: "NILKANTH ENTERPRISE",
    tagline: "Powered by NILKANTH ENTERPRISE",
    gstin,
    pan: gstin.length >= 12 ? gstin.slice(2, 12) : "",
    stateCode: gstin.slice(0, 2),
    address: process.env.MPL_ADDRESS || SUPPLIER_ADDRESS,
    email: "myprofilelive5@gmail.com",
    phone: "+91 7600688820",
    sac: "998431",
    sacLabel: "Online information and database access",
    gstRate: 18,
  };
}
