package com.monify.player;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(com.monify.player.plugins.LocalBackendPlugin.class);
        super.onCreate(savedInstanceState);
        
        BinaryExtractor.extractBinaries(this);
    }
}
