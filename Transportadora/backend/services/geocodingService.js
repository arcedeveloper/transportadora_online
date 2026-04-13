const NodeGeocoder = require('node-geocoder');

const options = {
  provider: 'openstreetmap',
  language: 'es',
  timeout: 10000
};

const geocoder = NodeGeocoder(options);

class GeocodingService {
  async obtenerCoordenadasExactas(direccionCompleta) {
    try {
      console.log(`📍 Buscando ubicación EXACTA para: "${direccionCompleta}"`);
      const { calle, ciudad } = this._separarCalleYCiudad(direccionCompleta);
      
      if (calle && calle.trim().length > 0) {
        console.log(`🎯 Buscando calle específica: "${calle}" en ciudad: "${ciudad}"`);
        
        const resultadoCalle = await this._buscarCalleExacta(calle, ciudad);
        if (resultadoCalle) {
          return resultadoCalle;
        }
      }
            console.log('🔄 Fallback: Buscando dirección completa...');
      const resultados = await geocoder.geocode({
        q: direccionCompleta + ', Paraguay',
        limit: 5
      });
      
      console.log(`📊 Resultados encontrados: ${resultados.length}`);
      
      if (resultados.length > 0) {
        const resultadoPreciso = this._filtrarResultadoMasPreciso(resultados, ciudad);
        
        if (resultadoPreciso) {
          const coordenadas = this._formatearResultado(resultadoPreciso, 'exacta');
          console.log(`✅ UBICACIÓN EXACTA ENCONTRADA:`);
          console.log(`   📍 ${coordenadas.lat}, ${coordenadas.lng}`);
          console.log(`   🏠 ${coordenadas.direccion}`);
          console.log(`   🏙️ Ciudad: ${coordenadas.ciudad}`);
          console.log(`   🏘️ Barrio: ${coordenadas.barrio}`);
          return coordenadas;
        }
      }
            console.log('⚠️ No se encontró la dirección exacta, buscando por ciudad...');
      return await this.obtenerCoordenadasPorCiudad(ciudad);
      
    } catch (error) {
      console.error('❌ Error buscando ubicación exacta:', error);
      const { ciudad } = this._separarCalleYCiudad(direccionCompleta);
      return await this.obtenerCoordenadasPorCiudad(ciudad);
    }
  }

  async _buscarCalleExacta(calle, ciudad) {
    try {
      const query = `${calle}, ${ciudad}, Paraguay`;
      console.log(`🔍 Búsqueda específica de calle: "${query}"`);
      
      const resultados = await geocoder.geocode({
        q: query,
        limit: 3
      });
            const resultadosFiltrados = resultados.filter(resultado => {
        const tieneCalle = resultado.street && 
                          resultado.street.toLowerCase().includes(calle.toLowerCase());
        const tieneCiudad = resultado.city && 
                           resultado.city.toLowerCase().includes(ciudad.toLowerCase());
        return tieneCalle || tieneCiudad;
      });
      
      if (resultadosFiltrados.length > 0) {
        const mejorResultado = resultadosFiltrados[0];
        const coordenadas = this._formatearResultado(mejorResultado, 'calle_exacta');
        
        console.log(`🎯 CALLE ESPECÍFICA ENCONTRADA:`);
        console.log(`   📍 ${coordenadas.lat}, ${coordenadas.lng}`);
        console.log(`   🛣️ Calle: ${coordenadas.calle}`);
        console.log(`   🏙️ Ciudad: ${coordenadas.ciudad}`);
        
        return coordenadas;
      }
      
      return null;
    } catch (error) {
      console.error('Error buscando calle específica:', error);
      return null;
    }
  }

  _separarCalleYCiudad(direccionCompleta) {
    const partes = direccionCompleta.split(',').map(parte => parte.trim());
    
    if (partes.length >= 2) {
      const ciudad = partes[0];
      const calle = partes.slice(1).join(', ');
      return { calle, ciudad };
    } else {
      return { calle: '', ciudad: partes[0] };
    }
  }
  _filtrarResultadoMasPreciso(resultados, ciudadBuscada) {
    const conCalle = resultados.filter(r => r.street);
    if (conCalle.length > 0) {
      const conCiudadCoincidente = conCalle.filter(r => 
        r.city && r.city.toLowerCase().includes(ciudadBuscada.toLowerCase())
      );
      return conCiudadCoincidente[0] || conCalle[0];
    }
    
    return resultados[0];
  }
  _formatearResultado(resultado, exactitud) {
    const { calle, ciudad } = this._separarCalleYCiudad(
      resultado.formattedAddress || `${resultado.street || ''}, ${resultado.city || ''}`
    );
    
    return {
      lat: parseFloat(resultado.latitude.toFixed(6)),
      lng: parseFloat(resultado.longitude.toFixed(6)),
      direccion: resultado.formattedAddress,
      calle: resultado.street || calle,
      numero: resultado.streetNumber || '',
      ciudad: resultado.city || ciudad,
      barrio: resultado.neighbourhood || '',
      exactitud: exactitud
    };
  }

  async obtenerCoordenadasPorCiudad(ciudad) {
    try {
      console.log(`📍 Buscando coordenadas para ciudad: "${ciudad}"`);
      
      const resultados = await geocoder.geocode({
        q: ciudad + ', Paraguay',
        limit: 3
      });
      
      if (resultados.length > 0) {
        const mejorResultado = resultados[0];
        
        const coordenadas = {
          lat: parseFloat(mejorResultado.latitude.toFixed(6)),
          lng: parseFloat(mejorResultado.longitude.toFixed(6)),
          direccion: mejorResultado.formattedAddress,
          ciudad: mejorResultado.city || ciudad,
          barrio: mejorResultado.neighbourhood || '',
          exactitud: 'ciudad'
        };
        
        console.log(`✅ Coordenadas de ciudad encontradas:`);
        console.log(`   📍 ${coordenadas.lat}, ${coordenadas.lng}`);
        console.log(`   🏠 ${coordenadas.direccion}`);
        
        return coordenadas;
      }
      
      return this._obtenerCoordenadasFallback(ciudad);
      
    } catch (error) {
      console.error('❌ Error en geocodificación:', error);
      return this._obtenerCoordenadasFallback(ciudad);
    }
  }

  _extraerCiudad(direccionCompleta) {
    const { ciudad } = this._separarCalleYCiudad(direccionCompleta);
    return ciudad;
  }

  _obtenerCoordenadasFallback(ciudad) {
    const ciudades = {
      'San Lorenzo': { lat: -25.339260, lng: -57.508790 },
      'Asunción': { lat: -25.263740, lng: -57.575926 },
      'Ñemby': { lat: -25.394900, lng: -57.554700 },
      'Luque': { lat: -25.266667, lng: -57.483333 },
      'Capiatá': { lat: -25.355200, lng: -57.445500 },
      'Lambaré': { lat: -25.346822, lng: -57.606467 }
    };
    
    const ciudadEncontrada = Object.keys(ciudades).find(
      key => ciudad.toLowerCase().includes(key.toLowerCase())
    ) || 'San Lorenzo';
    
    return {
      ...ciudades[ciudadEncontrada],
      direccion: `${ciudadEncontrada}, Paraguay`,
      ciudad: ciudadEncontrada,
      exactitud: 'fallback'
    };
  }

  async inicializarUbicacionesEmpresa(empresaId) {
    try {
      const pool = require('../models/database');
            const [empresas] = await pool.query(
        'SELECT empresa_id, nombre_empresa, ciudad FROM empresas WHERE empresa_id = ?',
        [empresaId]
      );
      
      if (empresas.length === 0) {
        throw new Error('Empresa no encontrada');
      }
      
      const empresa = empresas[0];
      console.log(`🏢 Inicializando ubicaciones para: ${empresa.nombre_empresa}`);
      console.log(`📍 Dirección registrada: ${empresa.ciudad}`);
      const coordenadas = await this.obtenerCoordenadasExactas(empresa.ciudad);
      
      return {
        empresa: empresa,
        coordenadas: coordenadas
      };
      
    } catch (error) {
      console.error('❌ Error inicializando ubicaciones:', error);
      throw error;
    }
  }
}

module.exports = new GeocodingService();