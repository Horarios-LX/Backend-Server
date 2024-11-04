const express = require("express")
const CMetropolitana = require("cmetropolitana.js")
const app = express()
const fs = require("fs")

let ready = false

let vehicles = {};

let notes = JSON.parse(fs.readFileSync(__dirname + "/../data/notes.json"));

let stopsRemapped;

async function fetchAll() {
    await CMetropolitana.alerts.fetchAll();
    await CMetropolitana.lines.fetchAll();
    await CMetropolitana.routes.fetchAll();
    await CMetropolitana.stops.fetchAll().then(a => stopsRemapped = Object.values(CMetropolitana.stops.cache._cache).map(a => ({ id: a.id, lat: a.lat, lon: a.lon, name: a.name, lines: a.lines})));
    await CMetropolitana.schools.fetchAll();
    await CMetropolitana.vehicles.fetchAll();
    return true;
}

fetchAll().then(r => ready = r);

CMetropolitana.vehicles.on("vehicleUpdate", (oldVec, newVec) => {
    if(!newVec) vehicles[oldVec.id] = null;
    vehicles[newVec.id] = { stopId: newVec.stop_id, timestamp: newVec.timestamp, lat: newVec.lat, lon: newVec.lon, bearing: newVec.bearing, pattern_id: newVec.pattern_id, color: CMetropolitana.lines.cache.get(newVec.line_id).color }
})

process.on('message', (data) => {
    if(data === "fetchAll") return fetchAll();
    if(data === "shutdown") return process.exit(1) && process.send("success");  
    if(data === "refreshNotes") return JSON.parse(fs.readFileSync(__dirname + "/../data/notes.json"));
});

app.get("/ping", (_, s) => s.sendStatus(200));
app.get("/ready", (_, s) => (ready ? s.sendStatus(200) : s.sendStatus(404)));

app.get("/vehicles", (_, s) => {
    return s.json(!ready ? {} : Object.values(vehicles))
})

app.get("/vehicles/:stop", (r, s) => {
    return s.json(!ready ? {} : Object.values(vehicles).filter(a => CMetropolitana.stops.cache.get(r.params.stop).patterns.includes(a.pattern_id)))
})

app.get("/stats", (_, s) => {
    return s.json(!ready ? {} : { vehicles: Object.keys(vehicles).length, lines: CMetropolitana.lines.cache.size()})
})

app.get("/stop/:id", (r, s) => {
    let res = !ready ? {} : CMetropolitana.stops.cache.get(r.params.id);
    if(res.id) res.alert = res.alerts().map(a => ({title: a.headerText, desc: a.descriptionText, url: a.url, effect: a.effect}));
    return s.json(res)
})

app.get("/routes/:route", (r, s) => {
    let res = !ready ? {} : CMetropolitana.routes.cache.get(r.params.route);
    return s.json(res)
})

app.get("/patterns/:route", (r, s) => {
    let res = !ready ? {} : CMetropolitana.routes.cache.get(r.params.route);
    return s.json(res)
})

app.get("/stops", (r, s) => {
    return s.json(!ready ? {} : stopsRemapped)
})

app.get("/getVehicle.js", (r, s) => {
    s.sendFile(__dirname + "/getVehicle.js")
})

app.get("/notes/:rg/:bus", (r, s) => {
    let busNotes = notes[r.params.rg + "|" + r.params.bus];
    s.json(busNotes || [])
})

app.listen("8080", () => console.log("Server's ready!"))