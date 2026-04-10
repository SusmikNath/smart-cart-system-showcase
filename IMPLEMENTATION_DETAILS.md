# 🔍 Implementation Details

## 🧠 System Architecture

The system consists of:

* Backend server (Node.js)
* ESP32 hardware device
* Firebase database
* Web frontend

---

## 🔄 Data Flow

### 1. RFID Scan

* ESP32 reads RFID tag
* Sends request:
  POST /device/scan
* Backend identifies product and adds to cart

---

### 2. Weight Detection

* Load cell measures cart weight
* ESP32 sends:
  POST /device/weight
* Backend compares:
  expected_weight vs actual_weight

---

### 3. Fraud Detection Logic

* If difference > tolerance → MISMATCH
* Cart is blocked from checkout

---

### 4. Cart State Management

Cart states:

* ACTIVE
* LOCKED
* PAYMENT_PENDING
* SUCCESS
* CLOSED

---

### 5. Payment Flow

* Cart locked for checkout
* QR generated
* Payment simulated
* Invoice created
* Exit token issued

---

### 6. Exit System

* Exit token verified
* Token consumed
* Cart reset for next user

---

## 🏷️ RFID Mapping

Example:

* 21C2DAAD → Milk → 500g
* AD117005 → Bread → 200g
* 253BA904 → Rice → 1000g

---

## ⚖️ Weight Logic

* Expected weight = sum of item weights
* Actual weight = load cell reading
* Tolerance applied
* Status:

  * OK
  * MISMATCH

---

## ⚙️ Hardware Integration

ESP32 handles:

* RFID scanning
* Weight reading
* API communication
* Buzzer feedback

---

## ⚠️ Challenges Faced

* Load cell calibration issues
* RFID read inconsistency
* weight synchronization with backend
* real-time mismatch detection

---

## 🚀 Future Improvements

* Replace RFID with barcode + camera
* Add mobile app interface
* Improve hardware reliability
* Add AI-based detection