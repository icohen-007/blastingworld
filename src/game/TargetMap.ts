import { getMapsApiKey, loadGoogleMaps } from "./StreetView";

const DUNKIN = {
  lat: 40.8017192,
  lng: -73.7358714,
  title: "Dunkin' · 566 Middle Neck Rd",
};

/**
 * Live Google Map in the target selector (Maps JavaScript API).
 */
export class TargetMap {
  private container: HTMLElement;
  private map: google.maps.Map | null = null;
  private marker: google.maps.Marker | null = null;
  private ready = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  get isReady(): boolean {
    return this.ready;
  }

  async init(): Promise<boolean> {
    const key = getMapsApiKey();
    if (!key) {
      this.showFallback("Add VITE_GOOGLE_MAPS_API_KEY to .env for Google Maps.");
      return false;
    }

    try {
      await loadGoogleMaps(key);
      this.container.innerHTML = "";
      this.map = new google.maps.Map(this.container, {
        center: { lat: DUNKIN.lat, lng: DUNKIN.lng },
        zoom: 18,
        mapTypeId: "roadmap",
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "cooperative",
        clickableIcons: false,
        styles: [
          { featureType: "poi", stylers: [{ visibility: "simplified" }] },
        ],
      });

      this.marker = new google.maps.Marker({
        position: { lat: DUNKIN.lat, lng: DUNKIN.lng },
        map: this.map,
        title: DUNKIN.title,
        animation: google.maps.Animation.DROP,
      });

      const info = new google.maps.InfoWindow({
        content: `<strong>${DUNKIN.title}</strong><br/>Great Neck, NY 11023`,
      });
      this.marker.addListener("click", () => {
        info.open({ map: this.map!, anchor: this.marker! });
      });
      info.open({ map: this.map, anchor: this.marker });

      this.ready = true;
      this.container.classList.add("target-map-live");
      return true;
    } catch (err) {
      console.error(err);
      this.showFallback(
        "Google Maps failed to load. Enable Maps JavaScript API for your key.",
      );
      return false;
    }
  }

  private showFallback(message: string): void {
    this.container.innerHTML = `
      <div class="target-map-fallback">
        <img src="/target-preview.svg" alt="Target preview" />
        <p>${message}</p>
      </div>
    `;
  }

  resize(): void {
    if (this.map) {
      google.maps.event.trigger(this.map, "resize");
      this.map.setCenter({ lat: DUNKIN.lat, lng: DUNKIN.lng });
    }
  }
}
