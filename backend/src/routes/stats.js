// backend/src/routes/stats.js
// GET /api/stats/summary - public numbers for the dashboard.

const express = require("express");

const db = require("../db");
const { getStatsSummary } = require("../services/queries");

const router = express.Router();

router.get("/summary", (req, res, next) => {
  try {
    return res.status(200).json(getStatsSummary(db));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
