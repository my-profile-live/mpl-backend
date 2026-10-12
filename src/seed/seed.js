/**
 * Seeds two demo accounts mirroring DEMO_JOBSEEKER_PROFILE / DEMO_COMPANY_PROFILE
 * from the frontend's AppContext.jsx, so the API can be exercised end-to-end
 * without going through Twilio/Brevo OTP delivery.
 * Run: npm run seed
 */
import dotenv from "dotenv";
dotenv.config();
import bcrypt from "bcryptjs";
import { connectDB } from "../config/db.js";
import JobSeeker from "../models/JobSeeker.js";
import Company from "../models/Company.js";
import mongoose from "mongoose";

async function run() {
  await connectDB();

  const passwordHash = await bcrypt.hash("password123", 10);

  await JobSeeker.deleteOne({ email: "user@example.com" });
  await JobSeeker.create({
    fullName: "Meera Shah",
    mobileNumber: "9825012345",
    email: "user@example.com",
    passwordHash,
    dob: "1994-06-12",
    gender: "Female",
    address: "12, Sunrise Society, Bopal",
    state: "Gujarat",
    district: "Ahmedabad",
    city: "Bopal",
    pinCode: "380058",
    about: "Area Sales Manager with 5+ years in agro-input distribution.",
    currentJobTitle: "Area Sales Manager",
    currentCompany: "Nova Agro Pvt Ltd",
    totalExperience: "5-8 yrs",
    relevantExperience: "4 yrs",
    currentSalary: "7.2",
    expectedSalary: "9.5",
    noticePeriod: "30 Days",
    preferredIndustry: "Agro",
    preferredJobState: "Gujarat",
    preferredJobCity: "Ahmedabad",
    jobType: "Full Time",
    wfh: "No",
    languagesKnown: ["Gujarati", "Hindi", "English"],
    employmentHistory: [
      {
        companyName: "Nova Agro Pvt Ltd",
        designation: "Area Sales Manager",
        joiningDate: "2022-03-01",
        leavingDate: "",
        responsibilities: "Handling territory sales, dealer onboarding and target planning.",
        experience: "2.5 yrs",
      },
      {
        companyName: "GreenField Agro Chemicals",
        designation: "Sales Executive",
        joiningDate: "2019-01-15",
        leavingDate: "2022-02-20",
        responsibilities: "Managed distributor network across North Gujarat.",
        experience: "3 yrs",
      },
    ],
    education: [
      {
        qualification: "MBA",
        specialization: "Marketing",
        college: "L.J Institute of Management",
        university: "Gujarat Technological University",
        passingYear: "2019",
        percentage: "72%",
      },
    ],
    skills: ["Sales", "Negotiation", "Team Management", "CRM"],
    hobbies: ["Travelling", "Fitness"],
    willingToTravel: true,
    readyToRelocate: false,
    immediateJoining: false,
    isMobileVerified: true,
    isEmailVerified: true,
    profileCompletion: 95,
    currentPlan: "trial",
    leadsRemaining: 3,
  });

  await Company.deleteOne({ companyEmail: "company@example.com" });
  await Company.create({
    companyName: "Nova Agro Pvt Ltd",
    companyType: "Private Limited",
    industry: "Agro",
    panNumber: "AAFCN1234K",
    gstNumber: "24AAFCN1234K1Z5",
    cinNumber: "U01100GJ2015PTC123456",
    website: "https://novaagro.example.com",
    companyEmail: "company@example.com",
    passwordHash,
    mobileNumber: "9998877665",
    contactPersonName: "Ankit Desai",
    designation: "HR Manager",
    officeAddress: "204, Titanium Business Park, S.G Highway",
    state: "Gujarat",
    district: "Ahmedabad",
    city: "Bopal",
    pinCode: "380059",
    companyDescription: "Nova Agro is a fast-growing agro-input company serving distributors across Western India.",
    yearOfEstablishment: "2015",
    numberOfEmployees: "120",
    productsServices: "Fertilizers, Bio-pesticides, Seed treatment solutions",
    workingDays: "Monday - Saturday",
    officeTiming: "9:30 AM - 6:30 PM",
    status: "Verified",
    isMobileVerified: true,
    isEmailVerified: true,
    profileCompletion: 100,
    currentPlan: "3m",
    leadsRemaining: 50,
  });

  console.log("[seed] Demo accounts created:");
  console.log("  Job seeker → user@example.com / password123");
  console.log("  Company    → company@example.com / password123");

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
