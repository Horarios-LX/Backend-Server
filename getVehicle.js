function getVehicle(vehicleId) {
    if (!vehicleId) return "UNKNOWN"
    let v = vehicleId.split("|")[1]
    v = parseInt(v)
    if (v === 1901) return "Autocarro com 3 portas"
    if (v < 730 || (v > 799 && v < 900) || v > 1799) return "Autocarro com 2 portas"
    if ((v > 729 && v < 750) || (v > 1699 && v < 1800)) return "Carrinha"
    if (v > 749 && v < 1500) return "Autocarro com 3 portas"
    return "UNKNOWN"
}

module.exports.getVehicle = getVehicle;