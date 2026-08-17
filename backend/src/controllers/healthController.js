export const getHealthStatus = (req, res) => {
  res.status(200).json({
    success: true,
    message: "PulseOps API is running",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
};