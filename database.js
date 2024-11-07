const fs = require("fs")

class DatabaseError extends Error {
    constructor(message) {
        super(message)
        this.name = "DatabaseError"
    }
}


/**
 * Creates a Database on the specified file location
 * @example 
 * const db = new Database("./db.json", { formatting: "compact" })
 * @constructor
 * @param {string} location - The location of the database.
 * @param {object} [options] - The database options, such as formatting.
 * @param {string} [options.formatting=compact] - The formatting settings for the JSON file.
 */
module.exports = function (location, options) {
	function stringifyWithOptions(databaseOBJ) {
    if(options) {
	    if(options.formatting) {
		    if(options.formatting === "compact") {
				return JSON.stringify(databaseOBJ)
		    } else if(options.formatting === "expanded") {
				return JSON.stringify(databaseOBJ, null, 2)
		    } else { throw new DatabaseError("Invalid formatting type.") }
	    } else { return JSON.stringify(databaseOBJ) }
    } else { return JSON.stringify(databaseOBJ) }
	}
    
    if(!location) throw new DatabaseError("Argument missing. Please put a location when creating a database.")
    let database
    try {
        database = JSON.parse(fs.readFileSync(location))
    } catch {
      database = {}
    }
    fs.writeFileSync(location, JSON.stringify(database))
  
    this.content = JSON.parse(fs.readFileSync(location))
    /**
    * The database name
    * @example 
    * console.log(db.name) // test.json
    * @readonly
        * @returns {string} name - The name of the database.
    */
    this.name = location.split("/")[location.split("/").length - 1]
    
    this.location = location
    
    /**
    * Database options, such as amount of backups
    * @example 
    * console.log(db.options) // {backups: "daily"}
    * @readonly
        * @returns {object} options - The options of the database.
    */
    this.options = options || {}

     /**
    * Database content
    * @example 
    * console.log(db.all()) // {"key": "value"}
    * @readonly
        * @returns {object} database - The contents of this DB
    */
     this.all = function() {
        return database;
     }

    /**
    * Reads a specific key of the database
    * @example 
    * console.log(db.read("test.status")) // "sucess"
    * @param {object} value - Value of the specified key.
    */
    this.read = function(key) {
        if(!key) return null
        if(typeof key != "string") throw new DatabaseError("Key name must be a string.")
        try {
            return database[key]
        } catch {
            return null
        }
    }

    this.push = function(key, value) {
        if(!key) return null;
        if(typeof key != "string") throw new DatabaseError("Key name must be a string.")
        try {
            database[key].push(value)
            fs.writeFileSync(location, stringifyWithOptions(database))
        } catch {
            return null
        }
    }

    /**
    * Checks if a specific key exists on the database
    * @example 
    * console.log(db.exists("test.status")) // true
    * @param {string} key - The key to check.
    * @returns {boolean} exists - True if the key exists.
    */
    this.exists = function(key) {
        try {
            return eval("database." + key) ? true :  false
        } catch {
            return false
        }
    }

    /**
    * Writes a value to the specified key
    * @example 
    * db.write("site","google") 
    * @param {string} key
    */
    this.write = function(key, value) {
        if(!key || !value) throw new DatabaseError("Please send a valid key and a value to set.")
        if(typeof key != "string") throw new DatabaseError("Key name must be a string.")
        try {
            database[key] = value
            fs.writeFileSync(location, stringifyWithOptions(database))
        } catch(e) {
            throw new DatabaseError(e)
        }
    }

    /**
    * Returns the value of the current database
    * @example 
    * db.value() 
    * @readonly
    */
    this.value = function() {
        try {
            return eval("database")
        } catch {
            return null
        }
    }

    /**
    * Cleans the database
    * @example 
    * db.clear()
    */
    this.clear = function() {
        try {
            database = {}
            fs.writeFileSync(location, JSON.stringify(database))
        } catch(e) {
            throw new DatabaseError(e)
        }
    }
    
    /**
    * Deletes one or more keys from the database
    * @example 
    * db.delete("door")
    * db.delete(["window", "door"])
    * @param (string|string[]) key
    * @todo Error handling
    */
    this.delete = function(key) {
	if(!key) throw new DatabaseError("Please send a valid key to delete")
	if(typeof key == "string") {
		delete database[`${key}`]
		fs.writeFileSync(location, JSON.stringify(database))
	} else if(typeof key == "object") {
		for (const keyToChange of key) {
			delete database[`${keyToChange}`]
		}
		fs.writeFileSync(location, JSON.stringify(database))
	} else { throw new DatabaseError("Please send a valid key to delete") }
    }
}
