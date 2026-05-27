import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
import os

print("🚀 Starting LSTM Model Training for SUIVI-DÉCHETS V2.0...")

# 1. Generate Synthetic Training Data (Representing 1 year of sensor data for a bin)
# In production, this would be fetched from the PostgreSQL `releves` table.
np.random.seed(42)
days = 365
hours_per_day = 24
total_steps = days * hours_per_day

# Base cyclical pattern (fill up over ~3 days, then drop to 0)
time = np.arange(total_steps)
period = 72 # 3 days
synthetic_data = (time % period) / period * 100

# Add noise and some random drops (collections)
noise = np.random.normal(0, 5, total_steps)
fill_levels = np.clip(synthetic_data + noise, 0, 100)

# 2. Data Preparation for LSTM
def create_sequences(data, seq_length):
    xs = []
    ys = []
    for i in range(len(data) - seq_length - 24): # Predict up to 24h ahead
        x = data[i:(i + seq_length)]
        y = data[i + seq_length : i + seq_length + 24] # Next 24 hours
        xs.append(x)
        ys.append(y)
    return np.array(xs), np.array(ys)

SEQ_LENGTH = 48 # Look back 48 hours
X, y = create_sequences(fill_levels, SEQ_LENGTH)

# Reshape for LSTM [samples, time_steps, features]
X = X.reshape((X.shape[0], X.shape[1], 1))

# Split train/test
split = int(0.8 * len(X))
X_train, X_test = X[:split], X[split:]
y_train, y_test = y[:split], y[split:]

# 3. Build LSTM Model
model = Sequential([
    LSTM(64, activation='relu', return_sequences=True, input_shape=(SEQ_LENGTH, 1)),
    Dropout(0.2),
    LSTM(32, activation='relu'),
    Dropout(0.2),
    Dense(24) # Output 24 continuous predictions (+1h to +24h)
])

model.compile(optimizer='adam', loss='mse', metrics=['mae'])
print(model.summary())

# 4. Train Model
print("⏳ Training model... This may take a moment.")
model.fit(X_train, y_train, epochs=5, batch_size=64, validation_split=0.1, verbose=1)

# 5. Evaluate and Save
loss, mae = model.evaluate(X_test, y_test, verbose=0)
print(f"✅ Training complete. Test MAE: {mae:.2f}%")

model_path = os.path.join(os.path.dirname(__file__), 'model.h5')
model.save(model_path)
print(f"💾 Model saved to {model_path}")
