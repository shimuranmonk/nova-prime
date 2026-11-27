# Training remote

Pair a keyboard-style Bluetooth remote using your device settings. In Nova Prime, open **Remote button** from the menu, select **Learn**, press the remote button, and select **Save**. The mapping is stored with the app settings. Use **Turn off** to remove it.

For Reps and Time, **Arm remote** retains the countdown. **Arm immediate start** authorizes a single remote start with no countdown. In live mode the robot must be connected and ready. Leaving the setup, changing its inputs, submitting it, or losing focus clears the arm. The on-screen Start button keeps its normal countdown. Music and MSYNC use their existing start controls and timing.

During a session, one press pauses or resumes after the 450 ms double-press window. Two presses stop the session, including during countdown. A remote must emit browser keyboard events. Device volume buttons are outside this interface.

The reference is the supplied `Nova Trainer3.html`, specifically its `js/ui/remote.js` section. Prime uses its own session controls and one-time arming.
