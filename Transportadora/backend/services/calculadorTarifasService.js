class CalculadorTarifasService {
    
    calcularDistancia(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
            
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return parseFloat((R * c).toFixed(2));
    }

    toRad(grados) {
        return grados * (Math.PI / 180);
    }
    async calcularCostoExtraDesdeEmpresa(empresaId, latRetiro, lonRetiro, costoBase = 0) {
        try {
            const pool = require('../models/database');
            
            const [empresas] = await pool.query(`
                SELECT empresa_id, nombre_empresa, ciudad 
                FROM empresas 
                WHERE empresa_id = ?
            `, [empresaId]);

            if (empresas.length === 0) {
                throw new Error('Empresa no encontrada');
            }

            const empresa = empresas[0];
                        const geocodingService = require('./geocodingService');
            const coordenadasEmpresa = await geocodingService.obtenerCoordenadasPorCiudad(empresa.ciudad);
            
            console.log(`🏢 ${empresa.nombre_empresa}: ${empresa.ciudad}`);
            console.log(`📍 Coordenadas empresa: ${coordenadasEmpresa.lat}, ${coordenadasEmpresa.lng}`);
            const tarifa = {
                distancia_base: 5.50,      
                costo_extra_km: 1000.00    
            };
            const distanciaEmpresaRetiro = this.calcularDistancia(
                coordenadasEmpresa.lat, coordenadasEmpresa.lng, 
                latRetiro, lonRetiro
            );
            
            console.log(`📏 Distancia empresa→retiro: ${distanciaEmpresaRetiro} km`);
            console.log(`💰 ${tarifa.distancia_base} km incluidos, Gs. ${tarifa.costo_extra_km} por km extra`);

            let costoExtra = 0;
            let kmExtra = 0;
            if (distanciaEmpresaRetiro > tarifa.distancia_base) {
                kmExtra = distanciaEmpresaRetiro - tarifa.distancia_base;
                costoExtra = kmExtra * tarifa.costo_extra_km;
                console.log(`📈 Km extra: ${kmExtra.toFixed(2)} x Gs. ${tarifa.costo_extra_km} = Gs. ${costoExtra}`);
            }

            const costoTotal = parseFloat(costoBase) + costoExtra;

            return {
                empresa: empresa.nombre_empresa,
                ciudad_empresa: empresa.ciudad,
                distancia_empresa_retiro: distanciaEmpresaRetiro,
                km_base_incluidos: tarifa.distancia_base,
                km_extra: kmExtra,
                costo_base: parseFloat(costoBase),
                costo_extra: costoExtra,
                costo_total: costoTotal,
                tarifa_por_km_extra: tarifa.costo_extra_km,
                coordenadas_empresa: { 
                    lat: coordenadasEmpresa.lat, 
                    lng: coordenadasEmpresa.lng,
                    direccion: coordenadasEmpresa.direccion 
                },
                coordenadas_retiro: { lat: latRetiro, lng: lonRetiro }
            };

        } catch (error) {
            console.error('❌ Error calculando costo:', error);
            throw error;
        }
    }

    formatearGuaranies(monto) {
        if (!monto || monto === 0) return 'Gs. 0';
        return `Gs. ${parseFloat(monto).toLocaleString('es-PY', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        })}`;
    }
}

module.exports = new CalculadorTarifasService();