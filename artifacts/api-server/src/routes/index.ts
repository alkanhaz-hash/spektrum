import { Router, type IRouter } from "express";
import healthRouter from "./health";
import moderationRouter from "./moderation";
import discoverRouter from "./discover";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/moderation", moderationRouter);
router.use("/discover", discoverRouter);

export default router;
