import express from "express";
import { getDatabaseStatus } from "../controllers/databaseController.js";

const router = express.Router();

router.get("/connection", getDatabaseStatus);

export default router;