import { testDatabaseConnection } from "../config/db.js";

export const getDatabaseStatus = async (req, res, next) => {
  try {
    const database = await testDatabaseConnection();

    res.status(200).json({
      success: true,
      message: "PulseOps database connection is healthy",
      database,
    });
  } catch (error) {
    next(error);
  }
};