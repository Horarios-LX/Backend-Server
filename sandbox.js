const express = require('express');
const router = express.Router();
const fs = require("fs");
const cors = require("cors")
const DB = require("./database")

let stops = new DB("./data/stops.json")

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

    router.get("/editor/stops/list/:id", async (r, s) => {
        if(!stops.read(r.params.id)) return s.json([]);
        return s.json(stops.read(r.params.id))
    });

    router.get("/editor/stops/upvote/:id/:s", async (r, res) => {
        if(!stops.read(r.params.id)) return res.sendStatus(404);
        let s = stops.read(r.params.id);
        if(!s.find(a => a.si.toString() === r.params.s)) return res.sendStatus(404);
        if((s.find(a => a.si.toString() === r.params.s).c2 || []).includes(r.query.id)) return res.sendStatus(404);
        s.find(a => a.si.toString() === r.params.s).c += 1;
        if(!s.find(a => a.si.toString() === r.params.s).c2) s.find(a => a.si.toString() === r.params.s).c2 = []
        s.find(a => a.si.toString() === r.params.s).c2.push(r.query.id);
        stops.write(r.params.id, s);
        res.sendStatus(200)
    });

    router.get("/editor/stops/suggest/:id", async (r, res) => {
        let u = r.query.user;
        let n = r.query.name;
        let s = stops.read(r.params.id) || [];
        s.push({i: r.params.id, name: n, user: u, si: s.length, c: 0, id: r.query.id})
        stops.write(r.params.id, s);
        res.sendStatus(200)
    });

    router.get("/editor/stops/", async (r, res) => {
        res.json(stops.all())
    });

    return router;
};