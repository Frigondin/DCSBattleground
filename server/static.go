package server

import (
	"bytes"
	"io/ioutil"
	"net/http"
	"path/filepath"
	"time"
	"log"

	"github.com/b1naryth1ef/sneaker"
	"github.com/go-chi/chi/v5"
)

func (h *httpServer) serveEmbeddedFile(path string, w http.ResponseWriter, r *http.Request) {
	if h.config.AssetsPath != nil {
		path := filepath.Join(*h.config.AssetsPath, path)

		contents, err := ioutil.ReadFile(path)
		if err != nil {
			http.Error(w, "Error reading file", http.StatusInternalServerError)
			return
		}

		fileName := filepath.Base(path)
		http.ServeContent(w, r, fileName, time.Now(), bytes.NewReader(contents))
	} else {
		f, err := sneaker.Static.ReadFile("dist/" + path)
		if err != nil {
			http.Error(w, "Not Found", http.StatusNotFound)
			return
		}

		fileName := filepath.Base(path)
		http.ServeContent(w, r, fileName, time.Now(), bytes.NewReader(f))
	}
}

// Serves static assets from the embedded filesystem
func (h *httpServer) serveEmbeddedStaticAssets(w http.ResponseWriter, r *http.Request) {
	param := chi.URLParam(r, "*")

	if h.config.AssetsPath != nil {
		path := filepath.Join(*h.config.AssetsPath, param)
		_, err := filepath.Rel(*h.config.AssetsPath, path)
		if err != nil {
			http.Error(w, "Not Found", http.StatusNotFound)
			return
		}

		contents, err := ioutil.ReadFile(path)
		if err != nil {
			http.Error(w, "Error reading file", http.StatusInternalServerError)
			return
		}

		fileName := filepath.Base(param)
		http.ServeContent(w, r, fileName, time.Now(), bytes.NewReader(contents))
	} else {
		f, err := sneaker.Static.ReadFile("dist/" + param)
		if err != nil {
			http.Error(w, "Not Found", http.StatusNotFound)
			return
		}

		fileName := filepath.Base(param)
		log.Printf(fileName)
		http.ServeContent(w, r, fileName, time.Now(), bytes.NewReader(f))
	}
}


// Serves static assets from the embedded filesystem
func (h *httpServer) serveEmbeddedStaticAssetsExternal(w http.ResponseWriter, r *http.Request) {
	param := chi.URLParam(r, "*")
	log.Printf(*h.config.AssetsPathExternal)
	log.Printf(param)
	
	if h.config.AssetsPathExternal != nil {
		path := filepath.Join(*h.config.AssetsPathExternal, param)
		_, err := filepath.Rel(*h.config.AssetsPathExternal, path)
		if err != nil {
			http.Error(w, "Not Found", http.StatusNotFound)
			return
		}

		contents, err := ioutil.ReadFile(path)
		if err != nil {
			http.Error(w, "Error reading file", http.StatusInternalServerError)
			return
		}

		fileName := filepath.Base(param)
		http.ServeContent(w, r, fileName, time.Now(), bytes.NewReader(contents))
	} 
}