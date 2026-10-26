# LookWhere Implementation Plan

This document outlines the phased implementation of the LookWhere project. 
**CRITICAL RULE:** Do not proceed to the next phase until the current phase is fully built, tested, and verified.

## Phase 1: Project Setup & Backend Foundation
**Goal:** Establish the project structure, install dependencies, and create a working backend server skeleton.
- [ ] Initialize `package.json` in root and `client` directories.
- [ ] Install Express, Cors, Multer, Dotenv for backend.
- [ ] Install React, Vite, and related plugins for frontend.
- [ ] Create `server/index.js` with basic Express setup and CORS enabled.
- [ ] Create `server/services/metaApiService.js` with stub functions for SAM, Voice, and Spark.
- [ ] **Verification:** Start the server (`npm run server`) and ensure it listens on port 3000 without errors.

## Phase 2: Frontend Skeleton & Camera Access
**Goal:** Build the React UI components and enable live camera feed access.
- [ ] Create `client/src/App.jsx` as the main container.
- [ ] Create `client/src/components/CameraView.jsx` using `navigator.mediaDevices`.
- [ ] Implement tap-to-select logic in `CameraView` to capture normalized (x, y) coordinates.
- [ ] Create `client/src/components/ResultCard.jsx` for displaying results.
- [ ] Add basic CSS for layout and camera overlay.
- [ ] **Verification:** Run the client (`npm run client`). Verify the camera feed loads and tapping the screen logs coordinates to the console.

## Phase 3: API Integration - SAM 3.1 & Voice Transcribe
**Goal:** Connect the backend to Meta Model API for segmentation and transcription.
- [ ] Implement `callSam31` in `metaApiService.js` using `axios` and FormData.
- [ ] Implement `callVoiceTranscribe` in `metaApiService.js`.
- [ ] Update `server/index.js` to handle multipart/form-data uploads for image and audio.
- [ ] **Verification:** Use Postman or curl to send a test image and audio to `/api/identify`. Verify that the backend receives valid segmentation masks and transcribed text from the API.

## Phase 4: API Integration - Muse Spark Grounding
**Goal:** Complete the pipeline by adding the reasoning model.
- [ ] Implement `callMuseSpark` in `metaApiService.js`, passing the image, mask, and transcription.
- [ ] Construct the system prompt to ensure grounding ("Describe ONLY the object in the mask...").
- [ ] Update the orchestrator in `metaApiService.js` to chain all three calls.
- [ ] **Verification:** Send a full request via Postman. Verify the final JSON response includes a coherent, grounded answer.

## Phase 5: End-to-End Integration & UI Polish
**Goal:** Connect frontend to backend and polish the user experience.
- [ ] Implement `sendToBackend` in `App.jsx` using `fetch` and `FormData`.
- [ ] Add loading states and error handling to the UI.
- [ ] Display the segmentation mask overlay on the camera feed.
- [ ] Style the `ResultCard` for readability and accessibility.
- [ ] **Verification:** Run both server and client. Perform a live test: tap an object, speak a question, and verify the answer appears correctly in the UI.

## Phase 6: Testing & Optimization
**Goal:** Ensure reliability and performance for the hackathon demo.
- [ ] Create a small eval set of 5 images and questions.
- [ ] Measure latency and optimize API calls (e.g., image compression).
- [ ] Handle edge cases (no internet, poor lighting, no object detected).
- [ ] **Verification:** Successfully run the eval set with >90% accuracy and <5s latency.