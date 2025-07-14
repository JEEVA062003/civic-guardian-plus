import React, { useEffect, useState, useRef, useCallback } from "react";
import "./App.css";
import { FaMapMarkedAlt } from "react-icons/fa";

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(2);
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
  const res = await fetch(url);
  const data = await res.json();
  return (
    data?.address?.suburb ||
    data?.address?.neighbourhood ||
    data?.address?.city_district ||
    data?.address?.town ||
    data?.address?.village ||
    data?.address?.city ||
    "Unknown"
  );
}

const App = () => {
  const [location, setLocation] = useState(null);
  const [network, setNetwork] = useState("");
  const [currentArea, setCurrentArea] = useState("Bengaluru");
  const [emergencyServices, setEmergencyServices] = useState([]);
  const observerRef = useRef(null);
  const canvasRef = useRef(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return;
    const updateNetwork = () => setNetwork(connection.effectiveType.toUpperCase());
    connection.addEventListener("change", updateNetwork);
    updateNetwork();
    return () => connection.removeEventListener("change", updateNetwork);
  }, []);

  useEffect(() => {
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observerRef.current.unobserve(entry.target);
        }
      });
    });
    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, []);

  const setObservedRef = useCallback((node) => {
    if (node && observerRef.current) {
      try {
        observerRef.current.observe(node);
      } catch (err) {
        console.warn("Observer error:", err);
      }
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const draw = () => {
      const width = canvas.parentElement.clientWidth;
      canvas.width = width > 400 ? 400 : width - 20;
      canvas.height = 180;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const boxWidth = (canvas.width - 80) / 3;
      ctx.fillStyle = "green";
      ctx.fillRect(20, 20, boxWidth, 100);
      ctx.fillStyle = "yellow";
      ctx.fillRect(40 + boxWidth, 20, boxWidth, 100);
      ctx.fillStyle = "red";
      ctx.fillRect(60 + 2 * boxWidth, 20, boxWidth, 100);
      ctx.font = "14px Arial";
      ctx.fillStyle = "white";
      ctx.fillText("Safe", 20 + boxWidth / 3, 150);
      ctx.fillText("Warning", 40 + boxWidth + boxWidth / 4, 150);
      ctx.fillText("Danger", 60 + 2 * boxWidth + boxWidth / 3, 150);
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, []);

  const fetchNearbyPlacesOSM = async (lat, lng) => {
    const radius = 3000;
    const query = `
      [out:json];
      (
        node(around:${radius},${lat},${lng})[amenity=hospital];
        node(around:${radius},${lat},${lng})[amenity=police];
        node(around:${radius},${lat},${lng})[emergency=fire_station];
      );
      out body;
    `;

    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });

      const data = await res.json();
      const places = data.elements.map((place) => {
        const dist = getDistanceFromLatLonInKm(lat, lng, place.lat, place.lon);
        return {
          name: place.tags.name || "Unnamed",
          type:
            place.tags.amenity === "hospital"
              ? "Hospital"
              : place.tags.amenity === "police"
              ? "Police"
              : "Fire Station",
          area: `${place.lat.toFixed(3)}, ${place.lon.toFixed(3)}`,
          distance: `${dist} km`,
        };
      });
      places.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
      setEmergencyServices(places);
    } catch (err) {
      console.error("Failed to fetch OSM data:", err);
    }
  };

  const handleLocate = () => {
    if ("geolocation" in navigator) {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = navigator.geolocation.watchPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setLocation({ lat: lat.toFixed(3), lng: lng.toFixed(3) });
          fetchNearbyPlacesOSM(lat, lng);
          const area = await reverseGeocode(lat, lng);
          setCurrentArea(area);
        },
        (err) => {
          alert("⚠️ " + err.message);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
      );
    } else {
      alert("❌ Geolocation not supported.");
    }
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  return (
    <div className="app">
      <header className="navbar">
        <div className="logo">
          <FaMapMarkedAlt className="icon" />
          <span>Civic Guardian+</span>
        </div>
        <nav className="nav-links">
          <a href="#safety">Tips</a>
          <button className="btn-solid"><a href="#report">Report</a></button>
        </nav>
      </header>

      <section className="hero">
        <h1>Civic Safety for <span className="highlight">Bengaluru</span></h1>
        <p>**Built with love for the citizens of Bengaluru**</p>
        <button className="btn-solid" onClick={handleLocate}>Locate Me</button>
      </section>

      <div className="banner">
        ⚠️ Protest Alert: Avoid MG Road today between 4 PM - 6 PM.
      </div>

      <section className="info-panel">
        {location && <p>📍 Lat {location.lat}, Lng {location.lng}</p>}
        {network && <p>📶 Network: {network}</p>}
        {currentArea && <p>🏙️ Area: {currentArea}</p>}
      </section>

      <section id="features" className="emergency-section">
        <h2>🚑 Emergency Help Near You</h2>
        <div className="card-grid">
          {emergencyServices.slice(0, 6).map((item, index) => (
            <div className="card" key={index} ref={setObservedRef}>
              <h3>{item.name}</h3>
              <p>🏦 {item.type}</p>
              <p>📍 {item.area}</p>
              <p>🛣️ {item.distance}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="map-section">
        <h2>Bengaluru Safety Zones Map</h2>
        <canvas ref={canvasRef} width={400} height={180} className="safety-canvas" />
      </section>

      <section id="safety" className="tips-section">
        <h2>⭐ Offline Safety Tips</h2>
        <ul>
          <li>🔋 Keep a power bank charged</li>
          <li>📞 Save helpline contacts offline</li>
          <li>❌ Avoid underpasses during heavy rain</li>
          <li>🗺️ Share your location with family</li>
        </ul>
      </section>

      <section id="report" className="report-section">
        <h2>📢 Report a Local Issue</h2>
        <form
          className="report-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.target;
            const report = {
              name: form.name.value,
              issue: form.issue.value,
              location: form.location.value,
            };
            console.log("📥 Report submitted:", report);
            alert("✅ Report submitted successfully!");
            form.reset();
          }}
        >
          <label>
            Your Name:
            <input type="text" name="name" required />
          </label>
          <label>
            Issue Description:
            <textarea name="issue" required placeholder="Describe the problem..." />
          </label>
          <label>
            Area / Location:
            <input type="text" name="location" defaultValue={currentArea} required />
          </label>
          <button className="btn-solid" type="submit">Submit Report</button>
        </form>
      </section>

      <footer className="footer">
        <p>© 2025 Civic Guardian+ | Built for Bengaluru</p>
      </footer>
    </div>
  );
};

export default App;
