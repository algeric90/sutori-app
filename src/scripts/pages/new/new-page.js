import NewPresenter from './new-presenter';
import * as StoriesAPI from '../../data/api';
import { loaderAbsoluteTemplate } from '../../templates';
import { convertBase64ToBlob } from '../../utils';
import Camera from '../../utils/camera';
import Map from '../../utils/map';

export default class NewPage {
  #presenter;
  #form;
  #map = null;
  #camera;
  #isCameraOpen = false;
  #takenPhoto = null; // hanya 1 foto

  async render() {
    return `
      <section class="container justify-content-center align-items-center p-3 py-md-4">
        <h1 class="mb-3 mb-lg-4">Add Story</h1>
        <div class="container">
          <div class="card rounded-5">
            <div class="card-body p-5">
              <form id="story-form" class="needs-validation" novalidate>
                
                <!-- Description -->
                <div class="mb-3">
                  <label for="description-input" class="form-label">Description</label>
                  <textarea class="form-control" id="description-input" rows="5" name="description" required></textarea>
                  <div class="invalid-feedback">Please insert description</div>
                </div>

                <!-- Photo -->
                <div>
                  <label for="photo-input" class="form-label">Photo</label>
                  <div class="mb-3">
                    <button id="photo-input-button" class="btn btn-outline-primary" type="button">Upload Photo</button>
                    <input
                      id="photo-input"
                      class="d-none"
                      name="photo"
                      type="file"
                      accept="image/*"
                      aria-describedby="photos-more-info"
                    >
                    <button id="open-photo-camera-button" class="btn btn-outline-primary" type="button">
                      Open Camera
                    </button>
                  </div>

                  <div id="camera-container" class="new-form__camera__container">
                    <video id="camera-video" class="new-form__camera__video">
                      Video stream not available.
                    </video>

                    <canvas id="camera-canvas" class="new-form__camera__canvas"></canvas>

                    <div class="new-form__camera__tools">
                      <select id="camera-select" class="form-select"></select>
                      <div class="new-form__camera__tools_buttons">
                        <button id="camera-take-button" class="btn btn-primary" type="button">
                          Take Photo
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Hasil foto tampil di sini -->
                  <div id="photo-preview" class="new-form__photo__preview"></div>
                </div>

                <!-- Location -->
                <div class="mb-3">
                  <div class="new-form__location__container">
                    <div class="new-form__location__map__container mb-3">
                      <div id="map" class="new-form__location__map"></div>
                      <div id="map-loading-container"></div>
                    </div>
                    <div class="d-block d-md-flex row g-3">
                      <div class="col-12 col-md-6 mb-2">
                        <label class="form-label" for="latitude">Latitude</label>
                        <input type="number" class="form-control" name="latitude" value="-6.175389" disabled>
                      </div>
                      <div class="col-12 col-md-6 mb-2">
                        <label class="form-label" for="longtitude">Longtitude</label>
                        <input type="number" class="form-control" name="longitude" value="106.827139" disabled>
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- Submit -->
                <div id="submit-button-container" class="d-grid text-end">
                  <button class="btn btn-primary" type="submit">Submit</button>
                </div>

              </form>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  async afterRender() {
    this.#presenter = new NewPresenter({
      view: this,
      model: StoriesAPI,
    });

    this.#takenPhoto = null;
    this.#presenter.showNewFormMap();
    this.#setupForm();  
  }

  #setupForm() {
    this.#form = document.getElementById('story-form');
    this.#form.addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (!this.#form.checkValidity()) {
        this.#form.classList.add('was-validated');
        return;
      }

      const data = {
        description: this.#form.elements.namedItem('description').value,
        photo: this.#takenPhoto ? this.#takenPhoto.blob : null,
        lat: this.#form.elements.namedItem('latitude').value,
        lon: this.#form.elements.namedItem('longitude').value,
      };

      await this.#presenter.postNewStory(data);
    });

    document.getElementById('photo-input').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (file) {
        await this.#addTakenPicture(file);
        await this.#populateTakenPicture();
      }
    });

    document.getElementById('photo-input-button').addEventListener('click', () => {
      this.#form.elements.namedItem('photo').click();
    });

    const cameraContainer = document.getElementById('camera-container');
    document
      .getElementById('open-photo-camera-button')
      .addEventListener('click', async (event) => {
        cameraContainer.classList.toggle('open');

        this.#isCameraOpen = cameraContainer.classList.contains('open');
        if (this.#isCameraOpen) {
          event.currentTarget.textContent = 'Close Camera';
          this.#setupCamera();
          this.#camera.launch();
          return;
        }

        event.currentTarget.textContent = 'Open Camera';
        this.#camera.stop();
      });
  }

  async initialMap() {
    this.#map = await Map.build('#map', {
      zoom: 15,
      locate: true,
    });
 
    // Preparing marker for select coordinate
    const centerCoordinate = this.#map.getCenter();
    const draggableMarker = this.#map.addMarker(
      [centerCoordinate.latitude, centerCoordinate.longitude],
    );
    draggableMarker.addEventListener('move', (event) => {
      const coordinate = event.target.getLatLng();
      this.#updateLatLngInput(coordinate.lat, coordinate.lng);
    });
    this.#map.addMapEventListener('click', (event) => {
      draggableMarker.setLatLng(event.latlng);
      event.sourceTarget.flyTo(event.latlng);
  });
  }
  #updateLatLngInput(lat, lon) {
    this.#form.elements.namedItem('latitude').value = lat;
    this.#form.elements.namedItem('longitude').value = lon;
  }

  #setupCamera() {
    if (this.#camera) return;

    this.#camera = new Camera({
      video: document.getElementById('camera-video'),
      cameraSelect: document.getElementById('camera-select'),
      canvas: document.getElementById('camera-canvas'),
    });

    this.#camera.addCheeseButtonListener('#camera-take-button', async () => {
      const image = await this.#camera.takePicture();
      await this.#addTakenPicture(image);
      await this.#populateTakenPicture();
    });
  }

  async #addTakenPicture(image) {
    let blob = image;
    if (typeof image === 'string') {
      blob = await convertBase64ToBlob(image, 'image/png');
    }

    this.#takenPhoto = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      blob,
    };
  }

  async #populateTakenPicture() {
    const photoPreview = document.getElementById('photo-preview');

    if (!this.#takenPhoto) {
      photoPreview.innerHTML = '';
      return;
    }

    const imageUrl = URL.createObjectURL(this.#takenPhoto.blob);
    photoPreview.innerHTML = `
      <div class="new-form__photo__preview-item">
        <button type="button" id="delete-photo-button" class="new-form__photo__delete-btn">
          <img src="${imageUrl}" alt="Photo Preview">
        </button>
      </div>
    `;

    document.getElementById('delete-photo-button').addEventListener('click', () => {
      this.#takenPhoto = null;
      this.#populateTakenPicture();
    });
  }

  storeSuccessfully(message) {
    console.log(message);
    this.clearForm();
    location.hash = '/';
  }

  storeFailed(message) {
    alert(message);
  }

  clearForm() {
    this.#form.reset();
    this.#takenPhoto = null;
    this.#populateTakenPicture();
  }

  showMapLoading() {
    document.getElementById('map-loading-container').innerHTML = loaderAbsoluteTemplate();
  }

  hideMapLoading() {
    document.getElementById('map-loading-container').innerHTML = '';
  }

  showSubmitLoadingButton() {
    document.getElementById('submit-button-container').innerHTML = `
      <button class="btn" type="submit" disabled>
        <i class="fas fa-spinner loader-button"></i> Posting...
      </button>
    `;
  }

  hideSubmitLoadingButton() {
    document.getElementById('submit-button-container').innerHTML = `
      <button class="btn btn-primary" type="submit">Submit</button>
    `;
  }
}
