import { useState, useEffect, useMemo } from 'react'
import emailjs from '@emailjs/browser'
import { supabase } from './supabaseClient'
import './App.css'
import data from './data.json'

// Calculate group matches statically
const groupMatches = data.matches.filter(match => {
  let foundT1 = false
  let foundT2 = false
  Object.values(data.groups).forEach(teams => {
    if (teams.some(t => t.id === match.team1)) foundT1 = true
    if (teams.some(t => t.id === match.team2)) foundT2 = true
  })
  return foundT1 && foundT2
})

const jornadas = [
  { name: 'Jornada 1', matches: groupMatches.filter(m => m.id >= 1 && m.id <= 24) },
  { name: 'Jornada 2', matches: groupMatches.filter(m => m.id >= 25 && m.id <= 48) },
  { name: 'Jornada 3', matches: groupMatches.filter(m => m.id >= 49 && m.id <= 72) }
]

// Helper to get team name by ID statically
const getTeamName = (teamId) => {
  for (const teams of Object.values(data.groups)) {
    const team = teams.find(t => t.id === teamId)
    if (team) return team.name
  }
  return teamId
}

// Helper to check if a match has already started
const isMatchStarted = (matchDate) => {
  if (!matchDate) return false
  return new Date() > new Date(matchDate)
}

function App() {
  const [currentView, setCurrentView] = useState('predict') // 'predict', 'admin', 'ranking'
  const [userName, setUserName] = useState('')
  const [userCedula, setUserCedula] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [predictions, setPredictions] = useState({})
  const [expandedJornadas, setExpandedJornadas] = useState({ 'Jornada 1': true })
  const [showGroups, setShowGroups] = useState(true)

  const toggleJornada = (jornadaName) => {
    setExpandedJornadas(prev => ({ ...prev, [jornadaName]: !prev[jornadaName] }))
  }
  
  // Supabase & Admin State
  const [allQuinielas, setAllQuinielas] = useState({})
  const [realResults, setRealResults] = useState({})
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false)
  const [adminPassAttempt, setAdminPassAttempt] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Load from Supabase on mount
  useEffect(() => {
    const fetchData = async () => {
      // 1. Fetch Quinielas
      const { data: quinielasData, error: qError } = await supabase
        .from('quinielas')
        .select('*')
      
      if (!qError && quinielasData) {
        const quinielasObj = quinielasData.reduce((acc, curr) => ({
          ...acc,
          [curr.nombre]: { 
            cedula: curr.cedula, 
            email: curr.email, 
            predictions: curr.predicciones 
          }
        }), {})
        setAllQuinielas(quinielasObj)
      }

      // 2. Fetch Real Results
      const { data: resultsData, error: rError } = await supabase
        .from('resultados_reales')
        .select('*')
      
      if (!rError && resultsData) {
        const resultsObj = resultsData.reduce((acc, curr) => ({
          ...acc,
          [curr.match_id]: {
            team1: curr.score_team1,
            team2: curr.score_team2
          }
        }), {})
        setRealResults(resultsObj)
      }
    }

    fetchData()
  }, [])

  // Handle score change for user predictions
  const handleScoreChange = (matchId, team, score) => {
    setPredictions(prev => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [team]: score === '' ? null : parseInt(score)
      }
    }))
  }

  // Handle score change for real results
  const handleRealScoreChange = (matchId, team, score) => {
    setRealResults(prev => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [team]: score === '' ? null : parseInt(score)
      }
    }))
  }

  const saveRealResults = async () => {
    setIsSaving(true)
    try {
      // Format results for the Edge Function
      const resultsArray = Object.entries(realResults).map(([id, scores]) => ({
        match_id: parseInt(id),
        score_team1: scores.team1,
        score_team2: scores.team2
      }))

      const response = await fetch('https://ivxvatmhgttcmyrqctos.supabase.co/functions/v1/save-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer sb_publishable_0AsGK4JBvD-IzmOsyj2AwQ_aQ94N0KK`
        },
        body: JSON.stringify({
          password: adminPassAttempt,
          results: resultsArray
        })
      })

      const result = await response.json()
      if (response.ok) {
        alert('¡Resultados Reales guardados en Supabase exitosamente!')
      } else {
        alert(`Error: ${result.error || 'No se pudo guardar'}`)
      }
    } catch (err) {
      console.error(err)
      alert('Error de conexión al intentar guardar resultados.')
    } finally {
      setIsSaving(false)
    }
  }

  // Save current user predictions
  const savePredictions = () => {
    if (!userName.trim() || !userCedula.trim() || !userEmail.trim()) {
      alert("Por favor ingresa tu Nombre, Cédula y Email para guardar la quiniela.")
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(userEmail.trim())) {
      alert("Por favor ingresa un correo electrónico válido (ejemplo: usuario@dominio.com).")
      return
    }

    const missingMatch = groupMatches.find(match => {
      // Skip validation for matches that have already started (user might have joined late)
      if (isMatchStarted(match.date)) return false
      
      const pred = predictions[match.id]
      return !pred || pred.team1 === undefined || pred.team1 === null || pred.team2 === undefined || pred.team2 === null
    })

    if (missingMatch) {
      alert(`Falta información. Debes completar el resultado para el Partido ${missingMatch.id} (${getTeamName(missingMatch.team1)} vs ${getTeamName(missingMatch.team2)}) antes de guardar tu quiniela.`)
      return
    }

    // Security check: ensure no predictions for past matches were modified (optional but good)
    // For now, we'll just allow saving, but since inputs are disabled, they shouldn't be able to change them.

    setIsSaving(true)
    
    const saveToSupabase = async () => {
      // 1. Save to quinielas table
      const { error: qError } = await supabase
        .from('quinielas')
        .upsert({
          nombre: userName.trim(),
          cedula: userCedula.trim(),
          email: userEmail.trim(),
          predicciones: predictions,
          updated_at: new Date().toISOString()
        }, { onConflict: 'cedula' })

      if (qError) {
        console.error('Error saving to quinielas:', qError)
        return false
      }

      // 2. Save to participantes table
      const { error: pError } = await supabase
        .from('participantes')
        .upsert({
          cedula: userCedula.trim(),
          nombre: userName.trim(),
          email: userEmail.trim(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'cedula' })

      if (pError) {
        console.error('Error saving to participantes:', pError)
        // We don't fail the whole process if this fails, but it's good to log
      }

      return true
    }

    saveToSupabase().then(success => {
      if (success) {
        // Update local state for immediate feedback
        const updated = { ...allQuinielas, [userName]: { cedula: userCedula, email: userEmail, predictions } }
        setAllQuinielas(updated)
        
        // Send email
        sendEmail()
      } else {
        alert("Hubo un error al guardar tu quiniela en la base de datos. Por favor intenta de nuevo.")
        setIsSaving(false)
      }
    })
  }

  const sendEmail = () => {
    let message = `Hola ${userName},\n\nAquí tienes un resumen de tus predicciones para la Quiniela Mundial 2026:\n\n`
    groupMatches.forEach(match => {
      const pred = predictions[match.id]
      if (pred) {
        message += `Partido ${match.id}: ${getTeamName(match.team1)} ${pred.team1} - ${pred.team2} ${getTeamName(match.team2)}\n`
      }
    })

    const templateParams = {
      to_name: userName,
      to_email: userEmail.trim(),
      message: message
    }

    const SERVICE_ID = "service_ubo7w6k"
    const TEMPLATE_ID = "template_f7bm9bf"
    const PUBLIC_KEY = "XsrSuQeRlCzw5sFkJ"

    if (SERVICE_ID !== "YOUR_SERVICE_ID_HERE") {
      emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY)
        .then((response) => {
           console.log('SUCCESS!', response.status, response.text);
           alert(`¡Predicciones de ${userName} guardadas en la nube y correo enviado exitosamente a ${userEmail}!`);
        }, (err) => {
           console.log('FAILED...', err);
           alert(`¡Predicciones guardadas en la nube! (Pero hubo un error enviando el correo: ${err.text})`);
        })
        .finally(() => setIsSaving(false));
    } else {
      alert(`¡Predicciones de ${userName} guardadas exitosamente! (El envío de correos requiere configuración en el código)`)
      setIsSaving(false)
    }
  }

  // Calculate points for the group standings (based on predictions OR real results)
  const calculateStandings = (matchData) => {
    const standings = {}
    Object.keys(data.groups).forEach(groupName => {
      standings[groupName] = data.groups[groupName].map(team => ({
        ...team, points: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, played: 0, won: 0, drawn: 0, lost: 0
      }))
    })

    data.matches.forEach(match => {
      const pred = matchData[match.id]
      if (pred && pred.team1 !== undefined && pred.team1 !== null && 
          pred.team2 !== undefined && pred.team2 !== null) {
        
        let matchGroup = null
        let t1Index = -1
        let t2Index = -1

        for (const [groupName, teams] of Object.entries(standings)) {
          const i1 = teams.findIndex(t => t.id === match.team1)
          const i2 = teams.findIndex(t => t.id === match.team2)
          if (i1 !== -1 && i2 !== -1) {
            matchGroup = groupName
            t1Index = i1
            t2Index = i2
            break
          }
        }

        if (matchGroup) {
          const s1 = pred.team1
          const s2 = pred.team2
          
          standings[matchGroup][t1Index].goalsFor += s1
          standings[matchGroup][t1Index].goalsAgainst += s2
          standings[matchGroup][t1Index].goalDiff += (s1 - s2)
          standings[matchGroup][t1Index].played += 1
          
          standings[matchGroup][t2Index].goalsFor += s2
          standings[matchGroup][t2Index].goalsAgainst += s1
          standings[matchGroup][t2Index].goalDiff += (s2 - s1)
          standings[matchGroup][t2Index].played += 1

          if (s1 > s2) {
            standings[matchGroup][t1Index].points += 3
            standings[matchGroup][t1Index].won += 1
            standings[matchGroup][t2Index].lost += 1
          } else if (s1 < s2) {
            standings[matchGroup][t2Index].points += 3
            standings[matchGroup][t2Index].won += 1
            standings[matchGroup][t1Index].lost += 1
          } else {
            standings[matchGroup][t1Index].points += 1
            standings[matchGroup][t2Index].points += 1
            standings[matchGroup][t1Index].drawn += 1
            standings[matchGroup][t2Index].drawn += 1
          }
        }
      }
    })

    Object.keys(standings).forEach(group => {
      standings[group].sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points
        if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff
        return b.goalsFor - a.goalsFor
      })
    })

    return standings
  }

  const groupStandings = useMemo(() => calculateStandings(predictions), [predictions])
  const realStandings = useMemo(() => calculateStandings(realResults), [realResults])

  // Calculate Ranking and Stats
  const rankingInfo = useMemo(() => {
    let playedMatches = 0
    
    // Contar encuentros disputados
    groupMatches.forEach(match => {
      const real = realResults[match.id]
      if (real && real.team1 !== null && real.team1 !== undefined &&
          real.team2 !== null && real.team2 !== undefined) {
          playedMatches += 1
      }
    })

    const totalGroupMatches = groupMatches.length
    const remainingMatches = totalGroupMatches - playedMatches
    const maxPossiblePoints = playedMatches * 3

    const scores = []
    for (const [user, userData] of Object.entries(allQuinielas)) {
      let points = 0
      let exactMatches = 0
      let partialMatches = 0
      
      const userPreds = userData.predictions || userData

      groupMatches.forEach(match => {
        const real = realResults[match.id]
        const pred = userPreds[match.id]
        
        if (real && real.team1 !== null && real.team1 !== undefined && real.team2 !== null && real.team2 !== undefined &&
            pred && pred.team1 !== null && pred.team1 !== undefined && pred.team2 !== null && pred.team2 !== undefined) {
            
            // Exact score
            if (real.team1 === pred.team1 && real.team2 === pred.team2) {
              points += 3
              exactMatches += 1
            } 
            // Correct tendency (win, lose, draw)
            else if (
              (real.team1 > real.team2 && pred.team1 > pred.team2) ||
              (real.team1 < real.team2 && pred.team1 < pred.team2) ||
              (real.team1 === real.team2 && pred.team1 === pred.team2)
            ) {
              points += 1
              partialMatches += 1
            }
        }
      })
      scores.push({ user, points, exactMatches, partialMatches })
    }
    
    return {
      playedMatches,
      remainingMatches,
      maxPossiblePoints,
      totalGroupMatches,
      scores: scores.sort((a, b) => b.points - a.points)
    }
  }, [allQuinielas, realResults])

  return (
    <div className="app-container">
      <div 
        className="banner-image glass-panel" 
        style={{ 
          width: '100%', 
          height: '250px', 
          backgroundImage: 'url("https://images.unsplash.com/photo-1579952363873-27f3bade9f55?q=50&w=1200&auto=format&fit=crop")', 
          backgroundSize: 'cover', 
          backgroundPosition: 'center', 
          marginBottom: '2rem',
          border: '1px solid rgba(0, 242, 254, 0.3)'
        }}
      ></div>
      <header className="header">
        <h1 style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px'}}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--primary-color)'}}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a4.5 4.5 0 0 0 0 9" />
            <path d="M12 13a4.5 4.5 0 0 0 0 9" />
            <path d="M4.5 6.5l3.5 2" />
            <path d="M19.5 6.5l-3.5 2" />
            <path d="M4.5 17.5l3.5-2" />
            <path d="M19.5 17.5l-3.5-2" />
          </svg>
          Quiniela <span className="text-gradient">2026</span>
        </h1>
        <div className="nav-tabs">
          <button className={`tab-btn ${currentView === 'predict' ? 'active' : ''}`} onClick={() => setCurrentView('predict')}>Mis Predicciones</button>
          <button className={`tab-btn ${currentView === 'ranking' ? 'active' : ''}`} onClick={() => setCurrentView('ranking')}>Ranking</button>
          <button className={`tab-btn ${currentView === 'admin' ? 'active' : ''}`} onClick={() => setCurrentView('admin')}>Administrador</button>
        </div>
      </header>

      {currentView === 'predict' && (
        <>
          <div className="user-input-section" style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
            <div style={{display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap'}}>
              <input 
                type="text" 
                className="user-name-input glass-panel" 
                placeholder="Cédula"
                value={userCedula}
                onChange={(e) => setUserCedula(e.target.value)}
              />
              <input 
                type="text" 
                className="user-name-input glass-panel" 
                placeholder="Nombre / Apodo"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
              />
              <input 
                type="email" 
                className="user-name-input glass-panel" 
                placeholder="Correo Electrónico"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
              />
            </div>
            <button className="save-btn" style={{marginTop: '1rem'}} onClick={savePredictions} disabled={isSaving}>
              {isSaving ? 'Guardando...' : 'Guardar mi Quiniela'}
            </button>
          </div>

          <section className="groups-section">
            <div 
              className="jornada-header-toggle glass-panel" 
              onClick={() => setShowGroups(prev => !prev)}
              style={{cursor: 'pointer', padding: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}
            >
              <h3 className="text-gradient" style={{margin: 0, fontSize: '1.5rem'}}>Posiciones de Grupos</h3>
              <span style={{fontSize: '1.5rem'}}>{showGroups ? '▲' : '▼'}</span>
            </div>
            {showGroups && (
            <div className="groups-grid">
              {Object.entries(groupStandings).map(([groupName, teams], idx) => (
                <div key={groupName} className="glass-panel group-card" style={{ animationDelay: `${idx * 0.05}s` }}>
                  <div className="group-header">
                    <h2 className="group-title">Grupo {groupName}</h2>
                  </div>
                  <ul className="team-list">
                    <li className="team-item team-header">
                      <span className="team-name" style={{fontSize: '0.8rem'}}>Equipo</span>
                      <div className="team-stats">
                        <span className="stat-label" title="Partidos Jugados">PJ</span>
                        <span className="stat-label" title="Partidos Ganados">PG</span>
                        <span className="stat-label" title="Partidos Empatados">PE</span>
                        <span className="stat-label" title="Partidos Perdidos">PP</span>
                        <span className="stat-label" title="Goles a Favor">GF</span>
                        <span className="stat-label" title="Goles en Contra">GC</span>
                        <span className="stat-label" title="Diferencia de Goles">DG</span>
                        <span className="stat-label" title="Puntos" style={{color: 'var(--primary-color)'}}>PTS</span>
                      </div>
                    </li>
                    {teams.map((team, index) => (
                      <li key={team.id} className="team-item">
                        <span className="team-name">{index + 1}. {team.name}</span>
                        <div className="team-stats">
                          <span className="stat-val">{team.played}</span>
                          <span className="stat-val">{team.won}</span>
                          <span className="stat-val">{team.drawn}</span>
                          <span className="stat-val">{team.lost}</span>
                          <span className="stat-val">{team.goalsFor}</span>
                          <span className="stat-val">{team.goalsAgainst}</span>
                          <span className="stat-val">{team.goalDiff > 0 ? `+${team.goalDiff}` : team.goalDiff}</span>
                          <span className="team-points">{team.points}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            )}
          </section>

          <section className="matches-section">
            <h2 className="matches-header text-gradient" style={{marginBottom: '2rem'}}>Fase de Grupos</h2>
            {jornadas.map((jornada, jIdx) => (
              <div key={jornada.name} className="jornada-section" style={{marginBottom: '3rem'}}>
                <div 
                  className="jornada-header-toggle glass-panel" 
                  onClick={() => toggleJornada(jornada.name)}
                  style={{cursor: 'pointer', padding: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}
                >
                  <h3 className="text-gradient" style={{margin: 0, fontSize: '1.5rem'}}>{jornada.name}</h3>
                  <span style={{fontSize: '1.5rem'}}>{expandedJornadas[jornada.name] ? '▲' : '▼'}</span>
                </div>
                {expandedJornadas[jornada.name] && (
                <div className="matches-grid">
                  {jornada.matches.map((match, idx) => {
                    const dateStr = match.date ? new Date(match.date).toLocaleDateString() : 'TBD'
                    const started = isMatchStarted(match.date)
                    return (
                      <div key={match.id} className={`glass-panel match-card ${started ? 'match-started' : ''}`} style={{ animationDelay: `${(idx % 10) * 0.05}s` }}>
                        <div className="match-info">
                          Partido {match.id} | {dateStr} {started && <span className="started-badge">Iniciado / Finalizado</span>}
                        </div>
                        <div className="match-teams">
                          <div className="team">{getTeamName(match.team1)}</div>
                          <input 
                            type="number" min="0" className="team-input"
                            value={predictions[match.id]?.team1 ?? ''}
                            onChange={(e) => handleScoreChange(match.id, 'team1', e.target.value)}
                            placeholder="0"
                            disabled={started}
                          />
                          <span className="vs-badge">VS</span>
                          <input 
                            type="number" min="0" className="team-input"
                            value={predictions[match.id]?.team2 ?? ''}
                            onChange={(e) => handleScoreChange(match.id, 'team2', e.target.value)}
                            placeholder="0"
                            disabled={started}
                          />
                          <div className="team">{getTeamName(match.team2)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                )}
              </div>
            ))}
          </section>

          <div style={{display: 'flex', justifyContent: 'center', marginTop: '2rem'}}>
            <button className="save-btn" onClick={savePredictions} disabled={isSaving}>
              {isSaving ? 'Guardando...' : 'Guardar mi Quiniela'}
            </button>
          </div>
        </>
      )}

      {currentView === 'admin' && (
        <>
          {!isAdminAuthenticated ? (
            <div className="glass-panel" style={{maxWidth: '400px', margin: '4rem auto', padding: '2rem', textAlign: 'center'}}>
              <h3 className="text-gradient" style={{marginBottom: '1.5rem'}}>Acceso Restringido</h3>
              <input 
                type="password" 
                className="user-name-input glass-panel" 
                style={{width: '100%', marginBottom: '1.5rem'}}
                placeholder="Contraseña de Administrador"
                value={adminPassAttempt}
                onChange={(e) => setAdminPassAttempt(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && setIsAdminAuthenticated(adminPassAttempt === 'P3trusk$17')}
              />
              <button 
                className="save-btn" 
                style={{width: '100%'}} 
                onClick={() => {
                  if (adminPassAttempt === 'P3trusk$17') {
                    setIsAdminAuthenticated(true)
                  } else {
                    alert('Contraseña incorrecta')
                  }
                }}
              >
                Entrar
              </button>
            </div>
          ) : (
            <>
              <div className="header" style={{marginBottom: '1rem'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <h2>Resultados Reales</h2>
                  <button className="tab-btn" onClick={() => setIsAdminAuthenticated(false)} style={{padding: '5px 15px', fontSize: '0.8rem'}}>Salir</button>
                </div>
                <p>Ingresa los resultados oficiales para calcular los puntos de todos.</p>
              </div>

              <div style={{display: 'flex', justifyContent: 'center'}}>
                <button className="save-btn" onClick={saveRealResults} style={{marginTop: 0, marginBottom: '2rem'}} disabled={isSaving}>
                  {isSaving ? 'Guardando...' : 'Guardar Resultados Reales'}
                </button>
              </div>
          
          <section className="groups-section" style={{marginBottom: '3rem'}}>
            <div 
              className="jornada-header-toggle glass-panel" 
              onClick={() => setShowGroups(prev => !prev)}
              style={{cursor: 'pointer', padding: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}
            >
              <h3 className="text-gradient" style={{margin: 0, fontSize: '1.5rem'}}>Posiciones Reales (Grupos)</h3>
              <span style={{fontSize: '1.5rem'}}>{showGroups ? '▲' : '▼'}</span>
            </div>
            {showGroups && (
            <div className="groups-grid">
              {Object.entries(realStandings).map(([groupName, teams], idx) => (
                <div key={groupName} className="glass-panel group-card" style={{ animationDelay: `${idx * 0.05}s` }}>
                  <div className="group-header">
                    <h2 className="group-title">Grupo {groupName}</h2>
                  </div>
                  <ul className="team-list">
                    <li className="team-item team-header">
                      <span className="team-name" style={{fontSize: '0.8rem'}}>Equipo</span>
                      <div className="team-stats">
                        <span className="stat-label" title="Partidos Jugados">PJ</span>
                        <span className="stat-label" title="Partidos Ganados">PG</span>
                        <span className="stat-label" title="Partidos Empatados">PE</span>
                        <span className="stat-label" title="Partidos Perdidos">PP</span>
                        <span className="stat-label" title="Goles a Favor">GF</span>
                        <span className="stat-label" title="Goles en Contra">GC</span>
                        <span className="stat-label" title="Diferencia de Goles">DG</span>
                        <span className="stat-label" title="Puntos" style={{color: 'var(--primary-color)'}}>PTS</span>
                      </div>
                    </li>
                    {teams.map((team, index) => (
                      <li key={team.id} className="team-item">
                        <span className="team-name">{index + 1}. {team.name}</span>
                        <div className="team-stats">
                          <span className="stat-val">{team.played}</span>
                          <span className="stat-val">{team.won}</span>
                          <span className="stat-val">{team.drawn}</span>
                          <span className="stat-val">{team.lost}</span>
                          <span className="stat-val">{team.goalsFor}</span>
                          <span className="stat-val">{team.goalsAgainst}</span>
                          <span className="stat-val">{team.goalDiff > 0 ? `+${team.goalDiff}` : team.goalDiff}</span>
                          <span className="team-points">{team.points}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            )}
          </section>

          <section className="matches-section" style={{marginTop: '0'}}>
            {jornadas.map((jornada, jIdx) => (
              <div key={jornada.name} className="jornada-section" style={{marginBottom: '3rem'}}>
                <div 
                  className="jornada-header-toggle glass-panel" 
                  onClick={() => toggleJornada(jornada.name)}
                  style={{cursor: 'pointer', padding: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}
                >
                  <h3 className="text-gradient" style={{margin: 0, fontSize: '1.5rem'}}>{jornada.name}</h3>
                  <span style={{fontSize: '1.5rem'}}>{expandedJornadas[jornada.name] ? '▲' : '▼'}</span>
                </div>
                {expandedJornadas[jornada.name] && (
                <div className="matches-grid">
                  {jornada.matches.map((match, idx) => {
                    const dateStr = match.date ? new Date(match.date).toLocaleDateString() : 'TBD'
                    const real = realResults[match.id]
                    const isFilled = real && real.team1 !== null && real.team1 !== undefined && real.team2 !== null && real.team2 !== undefined
                    return (
                      <div key={match.id} className={`glass-panel match-card admin-card ${isFilled ? 'admin-filled' : ''}`}>
                        <div className="match-info">Partido {match.id} | {dateStr}</div>
                        <div className="match-teams">
                          <div className="team">{getTeamName(match.team1)}</div>
                          <input 
                            type="number" min="0" className="team-input admin-input"
                            value={realResults[match.id]?.team1 ?? ''}
                            onChange={(e) => handleRealScoreChange(match.id, 'team1', e.target.value)}
                            placeholder="-"
                          />
                          <span className="vs-badge">VS</span>
                          <input 
                            type="number" min="0" className="team-input admin-input"
                            value={realResults[match.id]?.team2 ?? ''}
                            onChange={(e) => handleRealScoreChange(match.id, 'team2', e.target.value)}
                            placeholder="-"
                          />
                          <div className="team">{getTeamName(match.team2)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                )}
              </div>
            ))}
            </section>
          </>
          )}
        </>
      )}

      {currentView === 'ranking' && (
        <section className="ranking-section">
          <div className="header" style={{marginBottom: '2rem'}}>
            <h2>Ranking de Quinielas</h2>
          </div>

          <div className="stats-dashboard glass-panel" style={{marginBottom: '2rem', padding: '1.5rem', display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: '1rem'}}>
            <div className="stat-item" style={{textAlign: 'center'}}>
              <div style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>Encuentros Disputados</div>
              <div style={{fontSize: '2rem', color: 'var(--primary-color)', fontWeight: 800}}>{rankingInfo.playedMatches} / {rankingInfo.totalGroupMatches}</div>
            </div>
            <div className="stat-item" style={{textAlign: 'center'}}>
              <div style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>Encuentros Restantes</div>
              <div style={{fontSize: '2rem', color: 'var(--text-main)', fontWeight: 800}}>{rankingInfo.remainingMatches}</div>
            </div>
            <div className="stat-item" style={{textAlign: 'center'}}>
              <div style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>Puntos Disputados</div>
              <div style={{fontSize: '2rem', color: '#ff4b2b', fontWeight: 800}}>{rankingInfo.maxPossiblePoints} pts</div>
            </div>
          </div>

          <div className="ranking-table glass-panel">
            {rankingInfo.scores.length === 0 ? (
              <p style={{textAlign: 'center', padding: '2rem'}}>Aún no hay quinielas registradas.</p>
            ) : (
              rankingInfo.scores.map((user, idx) => {
                // Determine place based on distinct point values (ties share the same place)
                const distinctPoints = [...new Set(rankingInfo.scores.map(s => s.points))]
                const place = distinctPoints.indexOf(user.points) + 1
                const rankClass = place === 1 ? 'rank-1st' : place === 2 ? 'rank-2nd' : place === 3 ? 'rank-3rd' : ''
                return (
                <div key={user.user} className={`ranking-row ${rankClass}`}>
                  <div className="rank-number">#{place}</div>
                  <div className="rank-name">
                    {user.user}
                    <div style={{fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400}}>
                      Exactos: {user.exactMatches} | Parciales: {user.partialMatches}
                    </div>
                  </div>
                  <div className="rank-points">
                    <span style={{fontSize: '1rem', fontWeight: 400, marginRight: '10px'}}>Total Conseguidos:</span>
                    {user.points} pts
                  </div>
                </div>
                )
              })
            )}
          </div>
        </section>
      )}
    </div>
  )
}

export default App
