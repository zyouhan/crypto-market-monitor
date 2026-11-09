import { Router } from "express";

import { getConditionCatalog } from "../../conditions/registry";
import { success } from "../middleware";

export const conditionsRouter: Router = Router();

conditionsRouter.get("/", (_req, res) => {
  res.json(success(getConditionCatalog()));
});
