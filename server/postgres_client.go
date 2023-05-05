package server

import (
"fmt"
"database/sql"
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
			panic(err)
		}

		if err = db.Ping(); err != nil {
			panic(err)
		}
		// this will be printed in the terminal, confirming the connection to the database
		fmt.Println("The database is connected")
	}
}