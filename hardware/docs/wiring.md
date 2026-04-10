# 🔌 Wiring Guide

## 📡 RFID (RC522 → ESP32)

* SDA → GPIO 5
* SCK → GPIO 18
* MISO → GPIO 19
* MOSI → GPIO 23
* RST → GPIO 27
* VCC → 3.3V
* GND → GND

---

## ⚖️ HX711 → ESP32

* DT → GPIO 4
* SCK → GPIO 2
* VCC → 3.3V
* GND → GND

---

## 🔊 Buzzer

* Positive → GPIO 13
* Negative → GND

---

## ⚙️ Calibration

* Calibration factor: **421.0**
* Ensure no load during startup (tare)

---

## ⚠️ Notes

* Use 3.3V for RC522 (NOT 5V)
* Ensure proper grounding
* Avoid loose jumper wires