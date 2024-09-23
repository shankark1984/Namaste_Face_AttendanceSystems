const googleAppID = 'https://script.google.com/macros/s/AKfycbx_V1AZNPBvsM-FH0W7GcirUqjQXN2HRnsRes5KtB59Mdkdc00cTG7UzDxW7jVDMkvZOg/exec';
const SHEET_ID = '1SUSrUNR6kCB_6j0yS4oi6j5PknFDU6Us22cpeakWjgA';
const API_KEY = 'AIzaSyA3MFLlU9UUZ90dLQZFFyXqaeFfI6WO77o';
const EMPRange = 'EmployeeDetails!A2:E';

// Store registered faces
let registeredFaces = [];

// Function to start the video stream
async function startVideo() {
    try {
        await loadFaceApiModels();
        const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        const video = document.getElementById('video');
        video.srcObject = stream;

        video.addEventListener('play', handleVideoPlay);
        await loadRegisteredFaces();
    } catch (err) {
        console.error("Error accessing camera: ", err);
    }
}

// Load Face API models
async function loadFaceApiModels() {
    await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
    await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
}

// Handle video play event
function handleVideoPlay() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('overlay');
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    canvas.width = videoWidth;
    canvas.height = videoHeight;

    faceapi.matchDimensions(canvas, { width: videoWidth, height: videoHeight });

    setInterval(async () => {
        const detections = await detectFaces(video);
        const resizedDetections = faceapi.resizeResults(detections, { width: videoWidth, height: videoHeight });
        drawDetections(canvas, resizedDetections);
        updateRegisterButtonState(resizedDetections);
    }, 100);
}

// Detect faces in the video stream
async function detectFaces(video) {
    return await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptors();
}

// Draw face landmarks, bounding boxes, and labels
function drawDetections(canvas, detections) {
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);

    // Draw face landmarks and bounding boxes
    faceapi.draw.drawFaceLandmarks(canvas, detections);
    detections.forEach(detection => {
        const { detection: { box } } = detection;
        context.strokeStyle = 'red';
        context.lineWidth = 2;
        context.strokeRect(box.x, box.y, box.width, box.height);
    });

    // Draw labels (names or "Unknown")
    detections.forEach(detection => {
        const { detection: { box } } = detection;
        const bestMatch = findBestMatch(detection.descriptor);
        const label = bestMatch ? bestMatch.name : 'Unknown';

        context.font = '16px Arial';
        context.fillStyle = 'red';
        context.fillText(label, box.x, box.y > 10 ? box.y - 10 : 10);
    });
}

// Function to load registered faces from Google Sheets
async function loadRegisteredFaces() {
    try {
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${EMPRange}?key=${API_KEY}`);
        if (!response.ok) {
            throw new Error(`Error fetching employee data: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (!data.values) {
            throw new Error('No values found in the response.');
        }
        registeredFaces = data.values.map(row => ({
            name: row[1], // Assuming Employee Name is in the second column
            descriptor: new Float32Array(JSON.parse(row[3])) // Assuming Face Descriptor is in the fifth column
        }));
    } catch (error) {
        console.error('Error loading registered faces:', error);
    }
}

// Function to check if Employee Code exists in Google Sheets
async function checkEmpCodeExists(EmpCode) {
    try {
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${EMPRange}?key=${API_KEY}`);
        if (!response.ok) {
            throw new Error(`Error fetching employee data: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (!data.values || !Array.isArray(data.values)) {
            console.warn('No values found in the response.');
            return false;
        }
        const empCodes = data.values.map(row => row[0]); // Assuming EmpCode is in the first column
        return empCodes.includes(EmpCode);
    } catch (error) {
        console.error('Error checking employee code:', error);
        return false;
    }
}

// Function to register employee face
async function registerFace() {
    const EmpCode = document.getElementById('EmpCode').value;
    const empCodeExists = await checkEmpCodeExists(EmpCode);

    if (empCodeExists) {
        alert('Employee Code already exists. Please use a different code.');
        return;
    }

    const video = document.getElementById('video');
    const detections = await detectFaces(video);

    if (detections.length === 0) {
        alert('No face detected. Please try again.');
        return;
    }

    const faceDescriptor = detections[0].descriptor;
    const EmpName = document.getElementById('EmpName').value;
    const EmpStatus = document.getElementById('EmpStatus').value;

    const data = {
        sheetName: "EmployeeDetails",
        EmpCode: EmpCode,
        EmpName: EmpName,
        EmpStatus: EmpStatus,
        faceDescriptor: JSON.stringify(Array.from(faceDescriptor))
    };

    try {
        const response = await fetch(googleAppID, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        alert('Employee Registered Successfully');
    } catch (error) {
        console.error('Error registering employee:', error);
        alert('Error registering employee. Please try again.');
    }
}

// Function to find the best match from registered faces
function findBestMatch(descriptor) {
    const maxDistance = 0.6; // Maximum distance for a match (tune as needed)
    let bestMatch = null;
    let minDistance = maxDistance;

    for (const registeredFace of registeredFaces) {
        const distance = faceapi.euclideanDistance(descriptor, registeredFace.descriptor);
        if (distance < minDistance) {
            minDistance = distance;
            bestMatch = registeredFace;
        }
    }

    return bestMatch;
}

// Function to enable or disable the Register Face button based on face detection and matching
function updateRegisterButtonState(detections) {
    const registerButton = document.querySelector('button[type="submit"]');
    
    // Check if any detected face matches an existing registered face
    const hasMatchingFace = detections.some(detection => findBestMatch(detection.descriptor) !== null);
    
    // Disable the button if there's a matching face, otherwise enable it
    registerButton.disabled = hasMatchingFace;
}

// Call startVideo() when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', startVideo);
