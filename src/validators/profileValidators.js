import { z } from "zod";

/* Both update schemas are fully .partial() - PATCH-style updates where the
   client only sends the fields that changed (same UX as ProfileEdit.jsx's
   tabbed form saving one section at a time). */

export const updateJobSeekerSchema = z
  .object({
    fullName: z.string().min(1),
    dob: z.string(),
    gender: z.enum(["Male", "Female", "Other"]),
    about: z.string().max(1000),
    address: z.string(),
    state: z.string(),
    district: z.string(),
    city: z.string(),
    pinCode: z.string().regex(/^\d{6}$/),
    currentJobTitle: z.string(),
    currentCompany: z.string(),
    totalExperience: z.string(),
    relevantExperience: z.string(),
    currentSalary: z.string(),
    expectedSalary: z.string(),
    noticePeriod: z.string(),
    preferredIndustry: z.string(),
    preferredJobState: z.string(),
    preferredJobCity: z.string(),
    jobType: z.string(),
    wfh: z.enum(["Yes", "No", "Hybrid"]),
    languagesKnown: z.array(z.string()),
    employmentHistory: z.array(z.record(z.any())),
    education: z.array(z.record(z.any())),
    skills: z.array(z.string()),
    hobbies: z.array(z.string()),
    willingToTravel: z.boolean(),
    readyToRelocate: z.boolean(),
    immediateJoining: z.boolean(),
    preferredSalary: z.string(),
    preferredState: z.string(),
    preferredDistrict: z.string(),
    preferredCity: z.string(),
  })
  .partial();

export const updateCompanySchema = z
  .object({
    companyName: z.string().min(1),
    companyType: z.string(),
    industry: z.string(),
    website: z.string(),
    gstNumber: z.string(),
    cinNumber: z.string(),
    contactPersonName: z.string(),
    designation: z.string(),
    officeAddress: z.string(),
    state: z.string(),
    district: z.string(),
    city: z.string(),
    pinCode: z.string().regex(/^\d{6}$/),
    companyDescription: z.string(),
    yearOfEstablishment: z.string(),
    numberOfEmployees: z.string(),
    productsServices: z.string(),
    workingDays: z.string(),
    officeTiming: z.string(),
  })
  .partial();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
});
