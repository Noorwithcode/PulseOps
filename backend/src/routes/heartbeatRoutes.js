import express from "express";

import {
  receiveServerHeartbeat,
} from "../controllers/heartbeatController.js";

import {
  protect,
} from "../middleware/authMiddleware.js";

import {
  authorizeRoles,
} from "../middleware/roleMiddleware.js";

const router = express.Router();

router.post(
  "/:serverId/heartbeat",
  protect,
  authorizeRoles("ADMIN", "RESPONDER"),
  receiveServerHeartbeat
);

export default router;
