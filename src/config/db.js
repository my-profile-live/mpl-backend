import mongoose from "mongoose";

/**
 * Connects to MongoDB using Mongoose.
 * Exits the process on failure so the app never runs against a dead DB.
 */
export async function connectDB() {
  try {
    mongoose.set("strictQuery", true);
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`[db] MongoDB connected -> ${conn.connection.host}/${conn.connection.name}`);
  } catch (err) {
    console.error("[db] MongoDB connection failed:", err.message);
    process.exit(1);
  }
}
