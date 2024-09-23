const googleAppID = 'https://script.google.com/macros/s/AKfycbyyJ2Bpe6bQMp7qBBm-OSFEQMYAeCIcDFJD4BL0ZIu7w2EpzZXAgPxR1NZIqm4cRvLwLQ/exec';
const SHEET_ID = '1SUSrUNR6kCB_6j0yS4oi6j5PknFDU6Us22cpeakWjgA';
const API_KEY = 'AIzaSyBssovoHj8VbYZS-GHWXm7UnazRWBQ_xAg';
const EMPRange = 'EmployeeDetails!A2:E';
const ATTRange = 'Attendance!A2:I';

let registeredFaces = [];
let lastDetectionTimes = {}; // To store the last detection time for each employee
const DETECTION_DELAY = 5 * 60 * 1000; // 5 minutes in milliseconds

let currentEmpCode = '';
let currentEmpName = '';
let isFaceMatched = false;
let deviceID=localStorage.getItem('deviceId')

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
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    faceapi.matchDimensions(canvas, { width: video.videoWidth, height: video.videoHeight });

    setInterval(async () => {
        if (!isFaceMatched) {
            const detections = await detectFaces(video);
            const resizedDetections = faceapi.resizeResults(detections, { width: video.videoWidth, height: video.videoHeight });
            drawDetections(canvas, resizedDetections);
        }
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

    faceapi.draw.drawFaceLandmarks(canvas, detections);
    detections.forEach(detection => {
        const bestMatch = findBestMatch(detection.descriptor);
        const label = bestMatch ? bestMatch.name : 'Unknown';

        context.strokeStyle = 'red';
        context.lineWidth = 2;
        context.strokeRect(detection.detection.box.x, detection.detection.box.y, detection.detection.box.width, detection.detection.box.height);
        context.font = '16px Arial';
        context.fillStyle = 'red';
        context.fillText(label, detection.detection.box.x, detection.detection.box.y > 10 ? detection.detection.box.y - 10 : 10);

        if (bestMatch) {
            currentEmpCode = bestMatch.empCode;
            currentEmpName = bestMatch.name;

            // Check the delay for the detected face
            const now = Date.now();
            if (lastDetectionTimes[currentEmpCode] && (now - lastDetectionTimes[currentEmpCode] < DETECTION_DELAY)) {
                // If the last detection was less than 5 minutes ago, skip processing
                return;
            }

            // Update the last detection time for this employee
            lastDetectionTimes[currentEmpCode] = now;

            document.getElementById('EmpCode').value = currentEmpCode;
            document.getElementById('EmpName').value = currentEmpName;
            document.getElementById('AttendanceDateTime').value = getFormattedTimestamp();

            document.getElementById('video').pause();
            isFaceMatched = true;
            processAttendance(currentEmpCode);
        }
    });
}

// Load registered faces from Google Sheets
async function loadRegisteredFaces() {
    try {
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${EMPRange}?key=${API_KEY}`);
        if (!response.ok) throw new Error(`Error fetching employee data: ${response.status} ${response.statusText}`);
        
        const data = await response.json();
        registeredFaces = data.values.map(row => ({
            empCode: row[0],
            name: row[1],
            descriptor: new Float32Array(JSON.parse(row[3]))
        }));
    } catch (error) {
        console.error('Error loading registered faces:', error);
    }
}

// Process attendance automatically based on the last status
async function processAttendance(empCode) {
    try {
        // Fetch attendance records
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${ATTRange}?key=${API_KEY}`);
        if (!response.ok) throw new Error(`Error fetching attendance data: ${response.status} ${response.statusText}`);
        
        const data = await response.json();
        
        // Log the raw response data for debugging
        console.log('Raw API response:', data);
        
        // Check if 'values' is present and is an array
        if (!data.values || !Array.isArray(data.values)) {
            await insertAttendanceRecord();
            // console.error('Attendance data is not in the expected format:', data);
            // throw new Error('Invalid data format received from the API');
        }

        // Filter attendance records for the given employee code
        const empRecords = data.values.filter(row => row[2] === empCode);
        const lastRecord = empRecords.length > 0 ? empRecords[empRecords.length - 1] : null;

        // Determine action based on the last record status
        if (lastRecord) {
            // If there is a previous record, check the status
            if (lastRecord[6] === 'Login') {
                // If the last status is 'Login', update to 'Logout'
                await updateAttendanceRecord();
            } else {
                // If the last status is not 'Login', it means it's either 'Logout' or no record, insert a new one
                await insertAttendanceRecord();
            }
        } else {
            // If no records are found for the employee, this is their first attendance, so insert a record
            await insertAttendanceRecord();
        }

        // Delay before resuming face detection
        setTimeout(() => {
            isFaceMatched = false;
            document.getElementById('video').play();
        }, 2000);

    } catch (error) {
        console.error('Error processing attendance:', error);
    }
}


// Insert a new attendance record
async function insertAttendanceRecord() {
    const data = {
        sheetName: "Attendance",
        inTimestamp: getFormattedTimestamp(),
        EmpCode: document.getElementById('EmpCode').value,
        EmpName: document.getElementById('EmpName').value,
        LoginDateTime: getFormattedTimestamp(),
        Status: 'Login',
        InDeviceInformation: deviceID
    };

    try {
        await fetch(googleAppID, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        // alert('Logged in successfully');
        const audio = new Audio('mp3/login.mp3');
        audio.play();
    } catch (error) {
        console.error('Error inserting attendance record:', error);
    }
}

// Update an existing attendance record
async function updateAttendanceRecord() {
    const data = {
        sheetName: "Attendance",
        OutTimestamp: getFormattedTimestamp(),
        EmpCode: document.getElementById('EmpCode').value,
        LogoutDateTime: getFormattedTimestamp(),
        Status: 'Logout',
        OutDeviceInformation: deviceID
    };

    try {
        await fetch(googleAppID, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
                // Play the MP3 file
                const audio = new Audio('mp3/logout.mp3');
                audio.play();
        // alert('Logged out successfully');
    } catch (error) {
        console.error('Error updating attendance record:', error);
    }
}

// Find the best match from registered faces
function findBestMatch(descriptor) {
    let bestMatch = null;
    let minDistance = 0.6;

    for (const registeredFace of registeredFaces) {
        const distance = faceapi.euclideanDistance(descriptor, registeredFace.descriptor);
        if (distance < minDistance) {
            minDistance = distance;
            bestMatch = registeredFace;
        }
    }

    return bestMatch;
}

// Utility function to format the timestamp
function getFormattedTimestamp() {
    const date = new Date();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

// Initialize video on DOM load
document.addEventListener('DOMContentLoaded', startVideo);
