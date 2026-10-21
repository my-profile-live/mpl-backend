import { z } from "zod";
import {
  COMPANY_TYPES,
  INDUSTRIES,
  JOB_TYPES,
  WFH_OPTIONS,
  QUALIFICATIONS,
  NOTICE_PERIODS,
  EXPERIENCE_RANGES,
  GENDERS,
} from "../constants/options.js";

const CURRENT_YEAR = new Date().getFullYear();
const QUALIFICATIONS_WITHOUT_COLLEGE = ["10th", "12th"];

const password = z
  .string()
  .min(8, "Must be at least 8 characters")
  .regex(/[A-Z]/, "Must contain an uppercase letter")
  .regex(/[a-z]/, "Must contain a lowercase letter")
  .regex(/\d/, "Must contain a number")
  .regex(/[^A-Za-z0-9]/, "Must contain a special character");

const mobile = z
  .string()
  .regex(/^[0-9]{10}$/, "Mobile number must be exactly 10 digits");

const pinCode = z
  .string()
  .regex(/^[0-9]{6}$/, "PIN code must be exactly 6 digits");

const email = z.string().email("Enter a valid email address");

const jsonArray = (schema = z.string()) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }, z.array(schema).default([]));

const jsonBoolean = (defaultValue = false) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return defaultValue;
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "true" || s === "1") return true;
      if (s === "false" || s === "0") return false;
    }
    return defaultValue;
  }, z.boolean().default(defaultValue));

/* ── Company signup ── */
export const companySignupSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(1, "Company name is required")
    .min(2, "Company name must be at least 2 characters")
    .max(200, "Company name too long"),

  companyType: z.enum(COMPANY_TYPES, {
    errorMap: () => ({ message: "Please select a valid company type" }),
  }),

  industry: z.enum(INDUSTRIES, {
    errorMap: () => ({ message: "Please select a valid industry" }),
  }),

  website: z
    .string()
    .trim()
    .min(1, "Website is required")
    .refine(
      (v) => /^https?:\/\/.+\..+/.test(v),
      "Enter a valid URL (starting with http:// or https://)"
    ),

  panNumber: z
    .string()
    .trim()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/i, "Invalid PAN format (e.g. ABCDE1234F)")
    .transform((v) => v.toUpperCase()),

  gstNumber: z
    .string()
    .trim()
    .min(1, "GST number is required")
    .refine(
      (v) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v),
      "Invalid GST format (e.g. 22AAAAA0000A1Z5)"
    ),

  cinNumber: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(v),
      "Invalid CIN format (e.g. U01100GJ2015PTC123456)"
    ),

  password,

  companyEmail: email,

  mobileNumber: mobile,

  contactPersonName: z
    .string()
    .trim()
    .min(1, "Contact person name is required")
    .min(2, "Name must be at least 2 characters"),

  designation: z.string().trim().min(1, "Designation is required"),

  officeAddress: z
    .string()
    .trim()
    .min(1, "Office address is required")
    .min(5, "Address must be at least 5 characters"),

  state: z.string().trim().min(1, "State is required"),

  district: z.string().trim().min(1, "District is required"),

  pinCode,

  companyDescription: z
    .string()
    .trim()
    .min(1, "Company description is required")
    .min(10, "Description is too short. Add at least 10 characters")
    .max(2000, "Description too long"),

  yearOfEstablishment: z
    .string()
    .regex(/^(19|20)\d{2}$/, "Enter a valid 4-digit year")
    .refine(
      (v) => Number(v) <= CURRENT_YEAR,
      "Year cannot be in the future"
    ),

  numberOfEmployees: z
    .string()
    .min(1, "Number of employees is required")
    .regex(/^[0-9]+$/, "Enter a valid number")
    .refine((v) => Number(v) > 0, "Must be greater than 0"),

  productsServices: z
    .string()
    .trim()
    .min(1, "Products / Services is required"),

  workingDays: z
    .string()
    .trim()
    .min(1, "Select at least one working day"),

  officeTiming: z
    .string()
    .trim()
    .min(1, "Office timing is required")
    .refine((v) => {
      const parts = v.split(" - ");
      return parts[0] && parts[1];
    }, "Both start and end time are required"),

  profileCompletion: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined ? 0 : Number(v))),

  status: z.string().trim().max(50).optional().or(z.literal("")),
});

/* ── Job seeker signup ── */
const educationEntry = z
  .object({
    qualification: z.enum(QUALIFICATIONS, {
      errorMap: () => ({ message: "Qualification is required" }),
    }),
    specialization: z
      .string()
      .trim()
      .min(1, "Specialization is required"),
    college: z.string().optional().or(z.literal("")),
    state: z.string().trim().min(1, "State is required"),
    district: z.string().trim().min(1, "District is required"),
    passingYear: z
      .string()
      .regex(/^(19|20)\d{2}$/, "Enter a valid 4-digit year")
      .refine(
        (v) => Number(v) <= CURRENT_YEAR,
        "Passing year cannot be in the future"
      ),
    percentage: z
      .string()
      .trim()
      .min(1, "Percentage / CGPA is required"),
  })
  .refine(
    (ed) => {
      /* College is required unless qualification is 10th/12th */
      if (QUALIFICATIONS_WITHOUT_COLLEGE.includes(ed.qualification)) return true;
      return !!ed.college?.trim();
    },
    {
      message: "College is required",
      path: ["college"],
    }
  );

const employmentEntry = z.object({
  companyName: z.string().optional().or(z.literal("")),
  designation: z.string().optional().or(z.literal("")),
  joiningDate: z.string().optional().or(z.literal("")),
  leavingDate: z.string().optional().or(z.literal("")),
  experience: z.string().optional().or(z.literal("")),
  salary: z.string().optional().or(z.literal("")),
  responsibilities: z.string().optional().or(z.literal("")),
});

export const jobSeekerSignupSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, "Full name is required")
      .min(2, "Name must be at least 2 characters"),

    gender: z.enum(GENDERS, {
      errorMap: () => ({ message: "Please select a gender" }),
    }),

    mobileNumber: mobile,
    email,
    password,

    about: z
      .string()
      .trim()
      .min(1, "About is required")
      .min(10, "About is too short. Write at least 10 characters")
      .max(1000, "About is too long"),

    dob: z
      .string()
      .min(1, "Date of birth is required")
      .refine((v) => new Date(v) <= new Date(), "Date of birth cannot be in the future"),

    pinCode,
    address: z.string().trim().min(1, "Address is required"),
    state: z.string().trim().min(1, "State is required"),
    city: z.string().trim().min(1, "City is required"),

    currentJobTitle: z.string().trim().min(1, "Current job title is required"),
    currentCompany: z.string().optional().or(z.literal("")),

    totalExperience: z.enum(EXPERIENCE_RANGES, {
      errorMap: () => ({ message: "Total experience is required" }),
    }),
    relevantExperience: z.string().optional().or(z.literal("")),
    currentSalary: z.string().optional().or(z.literal("")),
    expectedSalary: z.string().optional().or(z.literal("")),
    noticePeriod: z.enum(NOTICE_PERIODS).optional().or(z.literal("")),

    preferredIndustry: z.string().trim().min(1, "Preferred industry is required"),
    preferredJobState: z.string().trim().min(1, "Preferred job state is required"),
    preferredJobCity: z.string().trim().min(1, "Preferred job city is required"),

    jobType: z.enum(JOB_TYPES, {
      errorMap: () => ({ message: "Job type is required" }),
    }),
    wfh: z.enum(WFH_OPTIONS, {
      errorMap: () => ({ message: "Work from home preference is required" }),
    }),

    languagesKnown: jsonArray(z.string()).refine(
      (arr) => arr.length > 0,
      "Please select at least one language"
    ),

    employmentHistory: jsonArray(employmentEntry),
    education: jsonArray(educationEntry).refine(
      (arr) => arr.length > 0,
      "Please add at least one education entry"
    ),

    skills: jsonArray(z.string()).refine(
      (arr) => arr.length > 0,
      "Please select at least one skill"
    ),
    hobbies: jsonArray(z.string()).refine(
      (arr) => arr.length > 0,
      "Please select at least one hobby"
    ),

    willingToTravel: jsonBoolean(false),
    readyToRelocate: jsonBoolean(false),
    immediateJoining: jsonBoolean(false),
  })
  .refine(
    (data) =>
      data.willingToTravel || data.readyToRelocate || data.immediateJoining,
    {
      message: "Please select at least one job preference",
      path: ["_jobPreference"],
    }
  );

/* ── Login / OTP ── */
export const requestMobileOtpSchema = z.object({
  userType: z.enum(["jobseeker", "company"]),
  mobileNumber: mobile,
});

export const verifyMobileLoginOtpSchema = z.object({
  userType: z.enum(["jobseeker", "company"]),
  mobileNumber: mobile,
  otp: z.string().length(4, "OTP must be 4 digits"),
});

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const verifySignupOtpSchema = z.object({
  pendingSignupId: objectId,
  channel: z.enum(["mobile", "email"]),
  otp: z.string().min(4).max(6),
});

export const resendOtpSchema = z.object({
  pendingSignupId: objectId,
  channel: z.enum(["mobile", "email"]),
});

export const emailLoginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export const resetPasswordSchema = z.object({
  token: z
    .string()
    .length(64, "Invalid reset token")
    .regex(/^[a-f0-9]+$/i, "Invalid reset token"),
  uid: z
    .string()
    .length(24, "Invalid user id")
    .regex(/^[a-f0-9]+$/i, "Invalid user id"),
  userType: z.enum(["jobseeker", "company"]),
  newPassword: password,
});