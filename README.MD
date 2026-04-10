# 🛒 Smart Cart System (RFID + Weight Verification)

## 📌 Overview

This project is a **smart shopping cart system** designed to automate item scanning, billing, and fraud detection using **RFID and weight verification**.

The system integrates:

* RFID-based product scanning
* Real-time cart tracking
* Weight mismatch detection
* QR-based payment flow
* Secure exit validation

---

## 🚀 Features

* 📡 RFID-based item scanning (ESP32 + RC522)
* ⚖️ Load cell-based weight verification (HX711)
* 🔐 JWT-based authentication system
* 🛒 Real-time cart updates
* ❌ Fraud detection using weight mismatch
* 💳 QR-based payment simulation
* 🧾 Invoice generation
* 🚪 Secure exit with token verification

---

## 🧠 Tech Stack

* Backend: Node.js, Express
* Database: Firebase Realtime DB
* Hardware: ESP32, RC522, HX711, Load Cell
* Communication: REST APIs

---

## 🔧 Hardware Used

* ESP32
* RC522 RFID Module
* HX711 Module
* Load Cell
* Buzzer

---

## 📂 Project Structure

```
backend/        -> Node backend APIs  
hardware/       -> ESP32 code + wiring docs  
```

---

## ⚙️ How it Works

1. User logs in and starts a cart session
2. Items are scanned using RFID
3. ESP32 sends scan data to backend
4. Expected weight is calculated
5. Load cell sends actual weight
6. Backend compares expected vs actual
7. If mismatch → payment blocked
8. If correct → user proceeds to payment
9. Exit token is generated and verified

---

## 🧪 Demo Flow

* Start cart session
* Scan item
* Place item on cart
* Verify weight
* Proceed to payment
* Exit with QR token

---

## 📌 Note

This is a **prototype system** designed to demonstrate smart retail automation.

---

## 👨‍💻 Author

Developed and implemented end-to-end system including backend logic, hardware integration, and real-time validation.


⚠️ This project was independently designed and implemented.Reusing code without attribution is not permitted.