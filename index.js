const express = require("express")
const CMetropolitana = require("cmetropolitana.js")
const app = express()
const fs = require("fs")

const cors = require("cors")

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'], 
    credentials: true 
}));

let departuresCache = {};

let positionCache = {};

let ready = false

let vehicles = {};

let notes = JSON.parse(fs.readFileSync(__dirname + "/data/notes.json"));

let stopsRemapped;

let schoolsRemapped;

let now = Date.now()/1000;

async function fetchAll() {
    
    await CMetropolitana.alerts.fetchAll();
    await CMetropolitana.lines.fetchAll();
    await CMetropolitana.routes.fetchAll();
    await CMetropolitana.stops.fetchAll().then(a => stopsRemapped = Object.values(CMetropolitana.stops.cache._cache).map(a => ({ id: a.id, lat: a.lat, lon: a.lon, name: a.name, lines: a.lines.map(b => ({text: b, color: (CMetropolitana.lines.cache.get(b) || { color: "#000000"}).color}))})));
    await CMetropolitana.schools.fetchAll().then(a => schoolsRemapped = Object.values(CMetropolitana.schools.cache._cache).map(a => ({lat: a.lat, lon: a.lon, id: a.id, name: a.name, stops: a.stops, loc: a.locality, mun: a.municipality_name })));
    await CMetropolitana.vehicles.fetchAll().then(r => vehicles = {...CMetropolitana.vehicles.cache._cache});
    Object.keys(vehicles).map(key => {
        newVec = vehicles[key];
        vehicles[key] = { id: newVec.id, tripId: (newVec.timestamp - (Date.now()/1000) > -300 ? newVec.trip_id : null), stopId: newVec.stop_id, timestamp: newVec.timestamp, lat: newVec.lat, lon: newVec.lon, bearing: newVec.bearing, pattern_id: newVec.pattern_id, color: (CMetropolitana.lines.cache.get(newVec.line_id) || { color: undefined }).color, notes: (notes[newVec.id] || null) };
        vehicles[key].prev_stop = null;
    })
    return true;
}

fetchAll().then(r => ready = r);

CMetropolitana.vehicles.on("vehicleUpdate", (oldVec, newVec) => {
    if(!newVec) {
        vehicles[oldVec.id] = undefined;
        positionCache[oldVec.id] = undefined;
    }
    if(!newVec.line_id) return;
    if(!ready) return;
    if(vehicles[newVec.id]) {
        prevStop = (newVec.stop_id === vehicles[newVec.id].stop_id ? vehicles[newVec.id].prev_stop || null : vehicles[newVec.id].stop_id)
    }
    now = Date.now()/1000;
    vehicles[newVec.id] = { id: newVec.id, tripId: (newVec.timestamp - (Date.now()/1000) > -300 ? newVec.trip_id : null), lineId: newVec.line_id, stopId: newVec.stop_id, timestamp: newVec.timestamp, lat: newVec.lat, lon: newVec.lon, bearing: newVec.bearing, pattern_id: newVec.pattern_id, color: (CMetropolitana.lines.cache.get(newVec.line_id) || { color: undefined }).color, notes: (notes[newVec.id] || null) }
    if(vehicles[newVec.id].trip_id) vehicles[newVec.id].prev_stop = prevStop;
    positionCache[newVec.id] ? positionCache[newVec.id].unshift([newVec.lat, newVec.lon]) : positionCache[newVec.id] = [[newVec.lat, newVec.lon]]
    if(positionCache[newVec.id].length > 120) positionCache[newVec.id].slice(0, 120)
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

app.get("/vehicles/:stop", async (r, s) => {
    if(!CMetropolitana.stops.cache.get(r.params.stop)) return s.json({})
    if(!departuresCache[r.params.stop]) departuresCache[r.params.stop] = (await CMetropolitana.stops.cache.get(r.params.stop).departures(Date.now())).map(a => a.trip_id);
    return s.json(!ready ? {} : Object.values(vehicles).filter(a => CMetropolitana.stops.cache.get(r.params.stop).patterns.includes(a.pattern_id) || (departuresCache[r.params.stop] ? departuresCache[r.params.stop].includes(a.trip_id) : false)))
})

app.get("/vehicles/:rg/:id/trip", async (r, s) => {
    return s.json(positionCache[r.params.rg + "|" + r.params.id] || [])
})

app.get("/stats", (_, s) => {
    return s.json(!ready ? {} : { vehicles: Object.values(vehicles).filter(a => a.tripId).length, lines: CMetropolitana.lines.cache.size()})
})

app.get("/stop/:id", (r, s) => {
    let res = !ready ? {} : CMetropolitana.stops.cache.get(r.params.id);
    if(res.id) {
        res.lineCols = {}; res.lines.map(a => res.lineCols[a] = (CMetropolitana.lines.cache.get(a) || undefined).color)
        res.alert = res.alerts().map(a => ({title: a.headerText, desc: a.descriptionText, url: a.url, effect: a.effect}));
    }
    return s.json(res)
})

app.get("/routes/:route", (r, s) => {
    let res = !ready ? {} : CMetropolitana.routes.cache.get(r.params.route);
    return s.json(res)
})

app.get("/patterns/:pattern", async (r, s) => {
    let res = !ready ? {} : (await CMetropolitana.patterns.fetch(r.params.pattern) || CMetropolitana.patterns.cache.get(r.params.pattern));
    if(res.id) {
        schedule = res.trips[0].schedule
        res = { id: res.id, color: res.color, long_name: CMetropolitana.routes.cache.get(res.route_id).long_name, headsign: res.headsign, line_id: res.line_id, shape_id: res.shape_id, path: res.path.map(a => ({id: a.stop.id, name: a.stop.name, stop_sequence: a.stop_sequence, travel_time: parseTime(schedule[a.stop_sequence - (res.path[0].stop_sequence)].travel_time ), lines: a.stop.lines.map(a => ({text: a, color: (CMetropolitana.lines.cache.get(a) || {color: undefined}).color}))}))}
    }
    return s.json(res)
})

app.get("/stops", (r, s) => {
    return s.json(!ready ? {} : stopsRemapped)
})

app.get("/schools", (r, s) => {
    return s.json(!ready ? {} : schoolsRemapped)
})

app.get("/getVehicle.js", (r, s) => {
    s.sendFile(__dirname + "/getVehicle.js")
})

app.get("/notes/:rg/:bus", (r, s) => {
    let busNotes = notes[r.params.rg + "|" + r.params.bus];
    s.json(busNotes || [])
})

function parseTime(t) {
    t = t.split(":")
    return parseInt(t[0]) * 60 + parseInt(t[1]) + parseInt(t[2])/60;
}

app.listen("8080", () => console.log("Server's ready!"))