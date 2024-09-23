const webAppUrl = 'https://script.google.com/macros/s/AKfycbzsnJFP1VAaYQHojDDqKvpxEYRHt_bGe2WQz3mL2hN7soAKt-KEXYqo66RBMWNhHqCoFg/exec';
const API_KEY_DA = 'AIzaSyBssovoHj8VbYZS-GHWXm7UnazRWBQ_xAg';
const SHEET_ID_DA = '1SUSrUNR6kCB_6j0yS4oi6j5PknFDU6Us22cpeakWjgA';
const Employee_Details_Range = 'EmployeeDetails!A2:C';
const Device_Details_Range = 'DeviceDetails!A2:F';
const Attendance_Range = 'Attendance!A2:I';

let device_ValidDate = '';
let device_NoofDevice = '';
let device_NoofActive = '';
let device_Status = '';
let deviceId = '';
let currentDate = new Date();

function initializeDeviceInfo() {
    deviceId = localStorage.getItem('deviceId');
    console.log(deviceId);
    if (!deviceId) {
        promptForDeviceId();
    } else {
        // If device ID exists, validate it
        console.log('1st stage');
        validateDevice(deviceId);
    }
}

const fetchDataFromGoogleSheets = async (range) => {
    try {
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID_DA}/values/${range}?key=${API_KEY_DA}`);
        if (!response.ok) {
            throw new Error("Failed to fetch data from database");
        }
        return await response.json();
    } catch (error) {
        console.error("Error: " + error);
        return null;
    }
};

// Function to validate device
const validateDevice = async (deviceId) => {
    const data = await fetchDataFromGoogleSheets(Device_Details_Range);
    if (!data) {
        alert("Failed to fetch data from database");
        return false;
    }

    const deviceData = data.values || [];
    const deviceRow = deviceData.find(row => row[0] === deviceId);

    if (!deviceRow) {
        alert(`Device with ID ${deviceId} not found.`);
        // Device ID not found, ask the user to enter it
        promptForDeviceId();
        return false;
    }

    console.log(deviceRow + " " + deviceId);
    device_ValidDate = new Date(deviceRow[2]);
    device_NoofDevice = parseInt(deviceRow[3], 10); // Convert to integer
    device_NoofActive = parseInt(deviceRow[4], 10); // Convert to integer
    device_Status = deviceRow[5];

    if (device_ValidDate < currentDate) {
        console.log("Device is expired, kindly contact your admin");
        return false;

    } else if (device_NoofDevice < device_NoofActive) {
        console.log('1');
        alert("No more devices can be activated."); // Alert user
        return false;
    } else if (device_Status === 'Used') { // Use '===' for comparison
        console.log('2');
        alert("Device is already in use."); // Alert user
        return false;
    }

    startVideo(); // Start video if validation is successful
};

function promptForDeviceId() {
    let newDeviceId = prompt('Please enter your Device ID:');
    while (!newDeviceId) {
        alert('Device ID is required to proceed.');
        newDeviceId = prompt('Please enter your Device ID:');
    }
    localStorage.setItem('deviceId', newDeviceId);
    location.reload(); // Reload the page to apply the new Device ID
}

// Service Worker registration
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);

            // Check for updates
            registration.onupdatefound = () => {
                const installingWorker = registration.installing;
                if (installingWorker) {
                    installingWorker.onstatechange = () => {
                        if (installingWorker.state === 'installed') {
                            if (navigator.serviceWorker.controller) {
                                // New update available
                                console.log('New update available');
                                if (confirm('New update available. Do you want to update now?')) {
                                    installingWorker.postMessage({ action: 'skipWaiting' });
                                }
                            } else {
                                // Content is cached for offline use
                                console.log('Content is cached for offline use.');
                            }
                        }
                    };
                }
            };
        }).catch(error => {
            console.log('ServiceWorker registration failed: ', error);
        });

    // Listen for the 'controllerchange' event to reload the page when the new service worker takes control
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
    });
}

// Initialize device ID check when the page loads
document.addEventListener('DOMContentLoaded', initializeDeviceInfo);
// Initialize video on DOM load
document.addEventListener('DOMContentLoaded', startVideo);
