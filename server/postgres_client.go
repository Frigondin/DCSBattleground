package server

import (
"database/sql"
"log"
//"net/http"
//"log"
_ "github.com/lib/pq"
)

var db *sql.DB

func initDB(config *Config) {
	var err error
	
	if config.Serverbot {
		connStr := config.Database
		db, err = sql.Open("postgres", connStr)

		if err != nil {
			log.Printf("database open failed: %v", err)
			db = nil
			return
		}

		if err = db.Ping(); err != nil {
			log.Printf("database ping failed: %v", err)
			_ = db.Close()
			db = nil
			return
		}
		// this will be printed in the terminal, confirming the connection to the database
		log.Printf("The database is connected")
	}
}