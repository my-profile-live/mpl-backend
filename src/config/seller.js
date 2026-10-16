/** Supplier details printed on every tax invoice. GSTIN comes from the server environment. */
export function sellerProfile() {
  const gstin = String(process.env.MPL_GSTIN || "").trim().toUpperCase();
  return {
    legalName: process.env.MPL_LEGAL_NAME || "My Profile Live",
    tradeName: "My Profile Live",
    tagline: "Right Executive, Right Company, Faster Hiring.",
    gstin,
    pan: gstin.length >= 12 ? gstin.slice(2, 12) : "",
    stateCode: gstin.slice(0, 2),
    address: process.env.MPL_ADDRESS || "India",
    email: "myprofilelive5@gmail.com",
    sac: "998431",
    sacLabel: "Online information and database access",
    gstRate: 18,
  };
}
