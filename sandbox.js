const express = require('express');
const router = express.Router();
const fs = require("fs");
const cors = require("cors")

module.exports = (positionCache, date) => {
    router.use(cors({
        origin: '*',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        credentials: true
    }));

    router.use("/*", (req, res, next) => {
        if (!req.get("Origin")&& !req.ip === "::1") return res.sendStatus(401);
        if (req.get("Origin") !== "https://hlx-sandbox.github.io/" && !req.ip === "::1") return res.sendStatus(401)
        next();
    })

    router.get("/vehicles/:rg/:id/trip", async (r, s) => {
        return s.json(positionCache[r.params.rg + "|" + r.params.id] || [])
    })

    router.get("/trip-history/:date/data", async (r, s) => {
        if (r.params.date === "now") r.params.date = date.replaceAll("/", "");
        if (!fs.existsSync("./tripHistory/" + r.params.date + "/data")) return s.sendStatus(404);
        return s.sendFile("/tripHistory/" + r.params.date + "/data", { root: "." })
    })

    router.get("/trip-history/:date/trips", async (r, s) => {
        if (r.params.date === "now") r.params.date = date.replaceAll("/", "");
        if (!fs.existsSync("./tripHistory/" + r.params.date + "/trips")) return s.sendStatus(404);
        return s.sendFile("/tripHistory/" + r.params.date + "/trips", { root: "." })
    })
    return router;
};