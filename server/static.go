package server

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/png"
	"io/ioutil"
	"net/http"
	"os"
	"path/filepath"
	"time"
	"log"

	"github.com/b1naryth1ef/sneaker"
	"github.com/go-chi/chi/v5"
)

var transparentTilePNG = buildTransparentTilePNG()

func buildTransparentTilePNG() []byte {
	img := image.NewNRGBA(image.Rect(0, 0, 1, 1))
	img.SetNRGBA(0, 0, color.NRGBA{R: 0, G: 0, B: 0, A: 0})

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil
	}
	return buf.Bytes()
}

func serveTransparentTile(w http.ResponseWriter, r *http.Request) {
	if len(transparentTilePNG) == 0 {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	http.ServeContent(w, r, "transparent.png", time.Now(), bytes.NewReader(transparentTilePNG))
}

func (h *httpServer) serveEmbeddedFile(path string, w http.ResponseWriter, r *http.Request) {
	if h.config.AssetsPath != nil {
		path := filepath.Join(*h.config.AssetsPath, path)

		contents, err := ioutil.ReadFile(path)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				http.Error(w, "Not Found", http.StatusNotFound)
			} else {
				http.Error(w, "Error reading file", http.StatusInternalServerError)
			}
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
			if errors.Is(err, os.ErrNotExist) {
				http.Error(w, "Not Found", http.StatusNotFound)
			} else {
				http.Error(w, "Error reading file", http.StatusInternalServerError)
			}
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
	//log.Printf(*h.config.AssetsPathExternal)
	//log.Printf(param)
	
	if h.config.AssetsPathExternal != nil {
		path := filepath.Join(*h.config.AssetsPathExternal, param)
		_, err := filepath.Rel(*h.config.AssetsPathExternal, path)
		if err != nil {
			http.Error(w, "Not Found", http.StatusNotFound)
			return
		}

		contents, err := ioutil.ReadFile(path)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				http.Error(w, "Not Found", http.StatusNotFound)
			} else {
				http.Error(w, "Error reading file", http.StatusInternalServerError)
			}
			return
		}

		fileName := filepath.Base(param)
		http.ServeContent(w, r, fileName, time.Now(), bytes.NewReader(contents))
	} else {
		http.Error(w, "Not Found", http.StatusNotFound)
	}
}



// DCSMaps embedded filesystem
func (h *httpServer) serverDCSMaps(w http.ResponseWriter, r *http.Request) {
	param := chi.URLParam(r, "*")
	//log.Printf(*h.config.DCSMapsPathExternal)
	//log.Printf(param)
	
	if h.config.DCSMapsPathExternal != nil {
		path := filepath.Join(*h.config.DCSMapsPathExternal, param)
		_, err := filepath.Rel(*h.config.DCSMapsPathExternal, path)
		if err != nil {
			http.Error(w, "Not Found", http.StatusNotFound)
			return
		}

		contents, err := ioutil.ReadFile(path)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				// Missing map tile: return a transparent tile to avoid noisy 404s in browser console.
				serveTransparentTile(w, r)
			} else {
				http.Error(w, "Error reading file", http.StatusInternalServerError)
			}
			return
		}

		fileName := filepath.Base(param)
		http.ServeContent(w, r, fileName, time.Now(), bytes.NewReader(contents))
	} else {
		serveTransparentTile(w, r)
	}
}