import pushRouter from "./push";
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import moderationRouter from "./moderation";
import discoverRouter from "./discover";
import adminRouter from "./admin";
import accountRouter from "./account";
import playCertificateRouter from "./play-certificate";
import weeklyVotingRouter from "./weekly-voting";
import readingAnalyticsRouter from "./reading-analytics";
import chapterAudioRouter from "./chapter-audio";

const router: IRouter = Router();
router.use(pushRouter);

router.use(healthRouter);
router.use("/moderation", moderationRouter);
router.use("/discover", discoverRouter);
router.use("/admin", adminRouter);
router.use(accountRouter);
router.use(playCertificateRouter);
router.use(weeklyVotingRouter);
router.use(readingAnalyticsRouter);
router.use(chapterAudioRouter);

export default router;
