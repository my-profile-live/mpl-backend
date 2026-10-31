const GST_STATE = {
  "jammu and kashmir": "01",
  "himachal pradesh": "02",
  punjab: "03",
  chandigarh: "04",
  uttarakhand: "05",
  haryana: "06",
  delhi: "07",
  rajasthan: "08",
  "uttar pradesh": "09",
  bihar: "10",
  sikkim: "11",
  "arunachal pradesh": "12",
  nagaland: "13",
  manipur: "14",
  mizoram: "15",
  tripura: "16",
  meghalaya: "17",
  assam: "18",
  "west bengal": "19",
  jharkhand: "20",
  odisha: "21",
  chhattisgarh: "22",
  "madhya pradesh": "23",
  gujarat: "24",
  maharashtra: "27",
  karnataka: "29",
  goa: "30",
  kerala: "32",
  "tamil nadu": "33",
  puducherry: "34",
  telangana: "36",
  "andhra pradesh": "37",
};

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftYears(iso, years) {
  const date = new Date(`${iso}T00:00:00`);
  date.setFullYear(date.getFullYear() + years);
  return isoDate(date);
}

export function dobLimits(now = new Date()) {
  const max = new Date(now);
  max.setFullYear(max.getFullYear() - 14);
  const min = new Date(now);
  min.setFullYear(min.getFullYear() - 80);
  return { min: isoDate(min), max: isoDate(max) };
}

export function dobError(value, { required = true } = {}) {
  const text = String(value || "").trim();
  if (!text) return required ? "Date of birth is required" : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "Enter a valid date of birth";
  const dob = new Date(`${text}T00:00:00`);
  if (Number.isNaN(dob.getTime()) || isoDate(dob) !== text) return "Enter a valid date of birth";
  const limits = dobLimits();
  if (text > isoDate(new Date())) return "Date of birth cannot be in the future";
  if (text > limits.max) return "You must be at least 14 years old";
  if (text < limits.min) return "Enter a date of birth within the last 80 years";
  return "";
}

export function passingYearError(year, dob) {
  const text = String(year || "").trim();
  if (!text) return "Passing year is required";
  if (!/^(19|20)\d{2}$/.test(text)) return "Enter a year like 2018";
  const value = Number(text);
  if (value > new Date().getFullYear()) return "Passing year cannot be in the future";
  const birth = String(dob || "").slice(0, 4);
  if (/^\d{4}$/.test(birth)) {
    const born = Number(birth);
    if (value < born) return "Passing year is before your date of birth";
    if (value < born + 14) return "Passing year is too early for your date of birth";
  }
  return "";
}

export function scoreError(raw) {
  const text = String(raw || "").trim();
  if (!text) return "Percentage / CGPA is required";
  const num = Number(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num)) return "Enter a percentage or CGPA, like 85% or 8.5 CGPA";
  if (!/%/.test(text) && num <= 10) {
    if (num <= 0 || num > 10) return "CGPA must be from 0.1 to 10";
    return "";
  }
  if (num <= 0 || num > 100) return "Percentage must be from 1 to 100";
  return "";
}

export function employmentDateError({ joiningDate, leavingDate, dob }) {
  const errors = {};
  const today = isoDate(new Date());
  if (joiningDate) {
    if (joiningDate > today) errors.joiningDate = "Joining date cannot be in the future";
    else if (dob && joiningDate < shiftYears(dob, 14)) {
      errors.joiningDate = "Joining date is too early for your date of birth";
    }
  }
  if (leavingDate && joiningDate && leavingDate < joiningDate) {
    errors.leavingDate = "Leaving date must be after the joining date";
  }
  return errors;
}

export function gstError({ gst, pan, state }) {
  const value = String(gst || "").trim().toUpperCase();
  if (!value) return "";
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(value)) {
    return "Invalid GST format (e.g. 24ABCDE1234F1Z5)";
  }
  const panValue = String(pan || "").trim().toUpperCase();
  if (panValue && value.slice(2, 12) !== panValue) return "GST number must include the same PAN";
  const code = GST_STATE[String(state || "").trim().toLowerCase()];
  if (code && value.slice(0, 2) !== code) return `GST number must start with ${code} for ${state}`;
  return "";
}

function clockMinutes(label) {
  const match = String(label || "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hours += 12;
  return hours * 60 + Number(match[2]);
}

export function officeTimingError(value) {
  const text = String(value || "").trim();
  if (!text) return "Office timing is required";
  const [start, end] = text.split(" - ");
  if (!start || !end) return "Both start and end time are required";
  const from = clockMinutes(start);
  const to = clockMinutes(end);
  if (from == null || to == null) return "Choose a start and end time";
  if (to <= from) return "End time must be after the start time";
  return "";
}
