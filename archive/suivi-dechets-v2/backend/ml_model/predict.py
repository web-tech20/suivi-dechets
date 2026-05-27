from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import tensorflow as tf
import numpy as np
import os
from datetime import datetime, timedelta

app = FastAPI(title="SUIVI-DÉCHETS V2.0 - ML Predict API")

# Enable CORS for local dev connecting from Express backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Model
model_path = os.path.join(os.path.dirname(__file__), 'model.h5')
model = None

@app.on_event("startup")
async def load_model():
    global model
    if os.path.exists(model_path):
        print("✅ Loading trained LSTM model...")
        model = tf.keras.models.load_model(model_path)
    else:
        print("⚠️ Model not found! Will use fallback simulated predictions. Run train.py first.")

@app.get("/predict/{bin_id}")
async def predict_fill(bin_id: str):
    # In production, we would query the DB for the last 48 hours of data for bin_id.
    # Here, we will simulate a recent history array.
    current_level = np.random.randint(30, 70)
    
    if model is not None:
        # Simulate recent history (48h)
        recent_history = np.linspace(max(0, current_level - 20), current_level, 48)
        # Reshape for LSTM [samples, time_steps, features]
        seq = recent_history.reshape(1, 48, 1)
        
        # Predict next 24 hours
        preds = model.predict(seq, verbose=0)[0]
        
        pred_6h = min(100, max(0, float(preds[5])))
        pred_12h = min(100, max(0, float(preds[11])))
        pred_24h = min(100, max(0, float(preds[23])))
        confidence = 0.92
    else:
        # Fallback if no model loaded
        pred_6h = min(100, current_level + 10)
        pred_12h = min(100, current_level + 25)
        pred_24h = min(100, current_level + 40)
        confidence = 0.80

    # Calculate recommended collection time (when it hits ~80%)
    # Interpolate roughly based on 24h prediction
    hours_to_80 = 24
    if pred_24h > current_level:
        rate = (pred_24h - current_level) / 24
        if rate > 0:
            hours_to_80 = (80 - current_level) / rate
    
    recommended_date = datetime.now() + timedelta(hours=max(1, min(72, hours_to_80)))

    return {
        "bin_id": bin_id,
        "current": current_level,
        "predicted_6h": round(pred_6h),
        "predicted_12h": round(pred_12h),
        "predicted_24h": round(pred_24h),
        "confidence": confidence,
        "recommended_collection": recommended_date.isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.1", port=5001)
