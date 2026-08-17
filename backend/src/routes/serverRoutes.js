import { Router } from "express";

import {
  deleteServer,
  getServerDetails,
  getServers,
  registerServer,
  restoreServer,
  updateServer,
  updateServerStatus,
} from "../controllers/serverController.js";

import {
  protect,
} from "../middleware/authMiddleware.js";

import {
  authorizeRoles,
} from "../middleware/roleMiddleware.js";

const router = Router();

router.get(
  "/",
  protect,
  getServers
);

router.get(
  "/:serverId",
  protect,
  getServerDetails
);

router.post(
  "/",
  protect,
  authorizeRoles("ADMIN", "RESPONDER"),
  registerServer
);

router.patch(
  "/:serverId",
  protect,
  authorizeRoles("ADMIN", "RESPONDER"),
  updateServer
);

router.patch(
  "/:serverId/status",
  protect,
  authorizeRoles("ADMIN", "RESPONDER"),
  updateServerStatus
);

router.delete(
  "/:serverId",
  protect,
  authorizeRoles("ADMIN"),
  deleteServer
);

router.patch(
  "/:serverId/restore",
  protect,
  authorizeRoles("ADMIN"),
  restoreServer
);

export default router;
