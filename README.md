# w0rp

real time voice warping, controlled by your hands

## stack

- typescript + vite
- web audio api
- mediapipe

### how pitch detection works

it uses the yin algorithm which
1. computes the difference function across time-lag values
2. normalise via cumulative mean
3. find the first dip below a confidence threshold

detection range: 60 - 1200 hz (B1-D6)