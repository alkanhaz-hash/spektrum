import { Router, type IRouter } from "express";
import healthRouter from "./health";
import moderationRouter from "./moderation";
import discoverRouter from "./discover";
import correctionRouter from "./correction";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/moderation", moderationRouter);
router.use("/discover", discoverRouter);
router.use("/correct", correctionRouter);
router.use("/admin", adminRouter);

export default router;
