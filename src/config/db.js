import mongoose from "mongoose";
import Interaction from "../models/Interaction.js";
import PlanPayment from "../models/PlanPayment.js";

/**
 * Connects to MongoDB using Mongoose.
 * Exits the process on failure so the app never runs against a dead DB.
 */
export async function connectDB() {
  try {
    mongoose.set("strictQuery", true);
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`[db] MongoDB connected -> ${conn.connection.host}/${conn.connection.name}`);
    await ensureActionIndex();
    await keepPaidInvoices();
  } catch (err) {
    console.error("[db] MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

/** One unlock, save, or shortlist per company and candidate. Views can repeat. */
async function ensureActionIndex() {
  try {
    const existing = await Interaction.db.db.listCollections({ name: "interactions" }).toArray();
    if (!existing.length) await Interaction.createCollection();
    const indexes = await Interaction.collection.indexes();
    const legacy = indexes.find(
      (index) => index.name === "company_1_jobSeeker_1_type_1_direction_1" && !index.unique
    );
    if (legacy) await Interaction.collection.dropIndex(legacy.name);
    await Interaction.syncIndexes();
  } catch (err) {
    console.error("[db] Could not enforce unique action index:", err.message);
    await Interaction.collection
      .createIndex(
        { company: 1, jobSeeker: 1, type: 1, direction: 1 },
        { name: "company_1_jobSeeker_1_type_1_direction_1" }
      )
      .catch(() => {});
  }
}

/** Unpaid checkouts expire. A paid invoice stays on the account. */
async function keepPaidInvoices() {
  try {
    const indexes = await PlanPayment.collection.indexes();
    const legacy = indexes.find(
      (index) => index.name === "expiresAt_1" && !index.partialFilterExpression
    );
    if (legacy) await PlanPayment.collection.dropIndex(legacy.name);
    await PlanPayment.syncIndexes();
  } catch (err) {
    console.error("[db] Could not keep paid invoices:", err.message);
  }
}
