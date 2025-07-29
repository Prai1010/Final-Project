document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("recommendationForm");
  const resultsContainer = document.getElementById("results");
  const loadingIndicator = document.getElementById("loading");
  const errorBox = document.getElementById("error");

  const weatherForm = document.getElementById("weatherForm");
  const weatherResult = document.getElementById("weatherResult");

  const geoapifyKey = "520559f8204a4dd0be7a7dda315ab318";
  const weatherApiKey = "cfb0d2e4fa7e44c08fc160524252407";

  function setupAutocomplete(inputId, suggestionId) {
    const input = document.getElementById(inputId);
    const suggestionBox = document.getElementById(suggestionId);
    let timeoutId;

    input.addEventListener("input", () => {
      const query = input.value.trim();
      clearTimeout(timeoutId);

      if (query.length < 2) {
        suggestionBox.innerHTML = "";
        suggestionBox.classList.add("hidden");
        return;
      }

      timeoutId = setTimeout(async () => {
        try {
          const res = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&limit=5&apiKey=${geoapifyKey}`);
          const data = await res.json();
          if (!data.features || data.features.length === 0) {
            suggestionBox.innerHTML = "";
            suggestionBox.classList.add("hidden");
            return;
          }

          suggestionBox.innerHTML = "";
          data.features.forEach(feature => {
            const city = feature.properties.city || feature.properties.name || feature.properties.address_line1;
            const country = feature.properties.country;
            const fullName = `${city}, ${country}`;

            const li = document.createElement("li");
            li.textContent = fullName;
            li.className = "px-4 py-2 hover:bg-blue-100 cursor-pointer";
            li.addEventListener("click", () => {
              input.value = fullName;
              suggestionBox.innerHTML = "";
              suggestionBox.classList.add("hidden");
            });

            suggestionBox.appendChild(li);
          });

          suggestionBox.classList.remove("hidden");
        } catch (err) {
          console.error("Autocomplete error:", err);
        }
      }, 300);
    });

    document.addEventListener("click", (e) => {
      if (!input.contains(e.target) && !suggestionBox.contains(e.target)) {
        suggestionBox.innerHTML = "";
        suggestionBox.classList.add("hidden");
      }
    });
  }

  setupAutocomplete("origin", "origin-suggestions");
  setupAutocomplete("location", "location-suggestions");

  const categoryFallbacks = {
    food: ["catering.restaurant", "catering.fast_food", "catering.cafe"],
    shopping: ["commercial.shopping_mall", "commercial.department_store", "commercial.clothing"],
    sightseeing: [
      "tourism.attraction", "tourism.sights", "entertainment.museum", "heritage.unesco",
      "entertainment.culture.gallery", "tourism.sights.place_of_worship.church",
      "tourism.sights.memorial", "man_made.tower"
    ],
    nature: ["leisure.park", "natural.water", "natural.forest", "leisure.picnic"]
  };

  function getReadableName(place) {
    if (!place.name || /[^\u0000-\u00ff]/.test(place.name)) {
      return place.formatted || place.address_line1 || "Unnamed";
    }
    return place.name;
  }

  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const originInput = document.getElementById("origin").value.trim();
    const destinationInput = document.getElementById("location").value.trim();
    const activities = [...document.querySelectorAll('input[name="activity"]:checked')].map(a => a.value);

    loadingIndicator.classList.remove("hidden");
    errorBox.textContent = "";
    resultsContainer.innerHTML = "";

    try {
      const geocode = async (place) => {
        const res = await fetch(`https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(place)}&lang=en&apiKey=${geoapifyKey}`);
        const data = await res.json();
        if (!data.features || data.features.length === 0) throw new Error("Geocode failed");
        const feature = data.features[0];
        return {
          lat: feature.geometry.coordinates[1],
          lon: feature.geometry.coordinates[0],
          name: feature.properties.city || place,
          country: feature.properties.country || "",
          region: feature.properties.state || feature.properties.county || ""
        };
      };

      const origin = await geocode(originInput);
      const destination = await geocode(destinationInput);

      async function fetchPlaceWithFallback(lat, lon, categories) {
        const fetches = categories.map(category => {
          const url = `https://api.geoapify.com/v2/places?categories=${category}&filter=circle:${lon},${lat},20000&limit=1&apiKey=${geoapifyKey}`;
          return fetch(url)
            .then(res => res.json())
            .then(data => data.features?.[0]?.properties || null);
        });
        try {
          return await Promise.any(fetches);
        } catch (e) {
          return null;
        }
      }

      const activityResults = await Promise.all(
        activities.map(async (activity) => {
          const fallbacks = categoryFallbacks[activity];
          if (!fallbacks) return `<li>${activity}: Unknown activity type</li>`;
          const place = await fetchPlaceWithFallback(destination.lat, destination.lon, fallbacks);
          if (place) {
            const readableName = getReadableName(place);
            return `<li>${activity}: <strong>${readableName}</strong> <span class="text-xs text-gray-500">(${place.address_line1 || "No address"})</span></li>`;
          } else {
            return `<li>${activity}: <span class="text-red-500">Not found nearby</span></li>`;
          }
        })
      );

      const distance = haversineDistance(origin.lat, origin.lon, destination.lat, destination.lon);
      const flightTime = (distance / 900).toFixed(1);
      const iata = {
        "Charlotte": "CLT", "Tokyo": "HND", "Paris": "CDG",
        "New York": "JFK", "Los Angeles": "LAX"
      };

      const flightURL = (iata[origin.name] && iata[destination.name])
        ? `https://www.google.com/flights?hl=en#flt=${iata[origin.name]}.${iata[destination.name]}`
        : null;

      const card = document.createElement("div");
      card.className = "bg-white/80 backdrop-blur-md rounded-xl p-6 shadow-lg border border-gray-200 animate-fadeIn";
      card.innerHTML = `
        <h3 class="text-xl font-semibold text-blue-800">${destination.name}, ${destination.country}</h3>
        <p class="text-sm text-gray-600">Region: ${destination.region}</p>
        <div class="mt-3">
          <p class="font-medium text-gray-700">Interests:</p>
          <ul class="list-disc ml-5 mt-1 text-sm text-gray-700 space-y-1">
            ${activityResults.join("")}
          </ul>
        </div>
        <div class="mt-4 text-sm text-gray-600">
          <p>From <strong>${origin.name}</strong> to <strong>${destination.name}</strong></p>
          <p>Distance: ~${distance.toFixed(0)} km</p>
          <p>Flight time: ~${flightTime} hrs</p>
          ${flightURL ? `<a href="${flightURL}" target="_blank" class="text-blue-600 underline">Check flights</a>` : ""}
        </div>
      `;

      resultsContainer.appendChild(card);
    } catch (err) {
      console.error("Top-level error:", err);
      errorBox.textContent = "Something went wrong. Please try again.";
    } finally {
      loadingIndicator.classList.add("hidden");
    }
  });

  if (weatherForm) {
    weatherForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const place = document.getElementById("weatherLocation").value.trim();
      const unit = document.querySelector('input[name="unit"]:checked')?.value || "c";
      weatherResult.innerHTML = "Loading weather...";

      try {
        const res = await fetch(`https://api.weatherapi.com/v1/current.json?key=${weatherApiKey}&q=${encodeURIComponent(place)}`);
        const data = await res.json();

        if (data.error) {
          weatherResult.innerHTML = `<p class="text-red-500">${data.error.message}</p>`;
          return;
        }

        const { name, country, localtime } = data.location;
        const { condition, temp_c, temp_f, wind_kph } = data.current;
        const temp = unit === "c" ? `${temp_c} °C` : `${temp_f} °F`;

        weatherResult.innerHTML = `
          <div class="bg-white/80 backdrop-blur-md p-4 rounded-lg shadow-md">
            <h4 class="text-md font-semibold">${name}, ${country}</h4>
            <ul class="list-disc ml-5 mt-2 text-sm text-gray-700">
              <li>Condition: ${condition.text}</li>
              <li>Temperature: ${temp}</li>
              <li>Wind: ${wind_kph} kph</li>
              <li>Local Time: ${localtime}</li>
            </ul>
          </div>
        `;
      } catch (err) {
        console.error("Weather fetch error:", err);
        weatherResult.innerHTML = `<p class="text-red-500">Something went wrong while fetching weather data.</p>`;
      }
    });
  }
});
