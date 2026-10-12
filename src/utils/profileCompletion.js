/**
 * Mirrors calculateProgress() from the frontend's SignupCompany.jsx /
 * SignupJobSeeker.jsx so completion % stays consistent whichever side
 * computes it.
 */
export function calcCompanyCompletion(company) {
  const fields = [
    company.companyName,
    company.companyType,
    company.industry,
    company.website,
    company.panNumber,
    company.gstNumber,
    company.cinNumber,
    company.companyEmail,
    company.mobileNumber,
    company.contactPersonName,
    company.designation,
    company.officeAddress,
    company.state,
    company.district,
    company.pinCode,
    company.companyDescription,
    company.yearOfEstablishment,
    company.numberOfEmployees,
    company.productsServices,
    company.workingDays,
    company.officeTiming,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}

export function calcJobSeekerCompletion(doc) {
  const checks = [
    !!doc.fullName,
    !!doc.photo,
    !!doc.mobileNumber,
    !!doc.email,
    !!doc.passwordHash,
    !!doc.about,
    !!doc.dob,
    !!doc.gender,
    !!doc.address,
    !!doc.state,
    !!doc.city,
    !!doc.pinCode,
    !!doc.totalExperience,
    !!doc.expectedSalary,
    Array.isArray(doc.education) && doc.education.length > 0,
    Array.isArray(doc.employmentHistory) && doc.employmentHistory.length > 0,
    Array.isArray(doc.skills) && doc.skills.length > 0,
    Array.isArray(doc.languagesKnown) && doc.languagesKnown.length > 0,
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}
