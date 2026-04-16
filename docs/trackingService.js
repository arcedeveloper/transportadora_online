class TrackingService {
    constructor() {
        this.socket = null;
        this.empresaId = null;
        this.onUbicacionCallback = null;
        this.onTransportistaConectadoCallback = null;
    }

    conectar(empresaId) {
        this.empresaId = empresaId;
        const token = localStorage.getItem('adminToken');
        
        this.socket = io('https://transportadoraonline-production.up.railway.app', {
            auth: { token },
            query: { token }
        });

        this.socket.on('connect', () => {
            console.log('Conectado a WebSocket de tracking');
            this.socket.emit('join-tracking-empresa', { empresaId });
        });

        this.socket.on('ubicacion-actualizada', (data) => {
            console.log('Ubicación actualizada via WebSocket:', data);
            if (this.onUbicacionCallback) {
                this.onUbicacionCallback(data);
            }
        });

        this.socket.on('transportista-en-viaje', (data) => {
            console.log('Transportista inició viaje:', data);
            if (this.onTransportistaConectadoCallback) {
                this.onTransportistaConectadoCallback(data);
            }
        });

        this.socket.on('transportista-viaje-completado', (data) => {
            console.log('Transportista completó viaje:', data);
        });
    }

    onUbicacionActualizada(callback) {
        this.onUbicacionCallback = callback;
    }

    onTransportistaConectado(callback) {
        this.onTransportistaConectadoCallback = callback;
    }

    desconectar() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}

window.TrackingService = TrackingService;
