import { useState, useEffect, useMemo } from 'react'
import emailjs from '@emailjs/browser'
import { supabase } from './supabaseClient'
import './App.css'
// import data from './data.json' // Removed local data dependency


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

  // Dynamic Data State
  const [teams, setTeams] = useState([])
  const [matches, setMatches] = useState([])
  const [groups, setGroups] = useState({})
  const [allQuinielas, setAllQuinielas] = useState({})
  const [realResults, setRealResults] = useState({})
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false)
  const [adminPassAttempt, setAdminPassAttempt] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const toggleJornada = (jornadaName) => {
    setExpandedJornadas(prev => ({ ...prev, [jornadaName]: !prev[jornadaName] }))
  }

  // Helper to get team name by ID
  const getTeamName = (teamId) => {
    const team = teams.find(t => t.id === teamId)
    return team ? team.name : teamId
  }

  // Load from Supabase on mount
  useEffect(() => {
    const fetchData = async () => {
      // 1. Fetch Teams
      const { data: teamsData } = await supabase.from('teams').select('*')
      if (teamsData) {
        setTeams(teamsData)
        const grouped = teamsData.reduce((acc, curr) => {
          const letter = curr.group_letter
          if (!acc[letter]) acc[letter] = []
          acc[letter].push(curr)
          return acc
        }, {})
        setGroups(grouped)
      }

      // 2. Fetch Matches
      const { data: matchesData } = await supabase.from('matches').select('*').order('id')
      if (matchesData) setMatches(matchesData)

      // 3. Fetch Quinielas
      const { data: qData } = await supabase.from('quinielas').select('*')
      if (qData) {
        const quinielasObj = {}
        qData.forEach(q => {
          quinielasObj[q.id] = {
            name: q.nombre,
            cedula: q.cedula,
            email: q.email,
            predictions: q.predicciones
          }
        })
        setAllQuinielas(quinielasObj)
      }

      // 4. Populate Real Results from matches table
      if (matchesData) {
        const resultsObj = matchesData.reduce((acc, curr) => {
          if (curr.score_team1 !== null && curr.score_team2 !== null) {
            acc[curr.id] = { team1: curr.score_team1, team2: curr.score_team2 }
          }
          return acc
        }, {})
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
      const resultsArray = Object.entries(realResults)
        .filter(([id, scores]) => scores.team1 !== null && scores.team1 !== undefined && scores.team1 !== '' && 
                                  scores.team2 !== null && scores.team2 !== undefined && scores.team2 !== '')
        .map(([id, scores]) => ({
          match_id: parseInt(id),
          score_team1: scores.team1,
          score_team2: scores.team2
        }))

      if (resultsArray.length === 0) {
        alert("No hay resultados completos para guardar (asegúrate de ingresar ambos goles del partido).")
        setIsSaving(false)
        return
      }

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
      if (!response.ok) {
        throw new Error(result.error || `Error del servidor (Código: ${response.status})`)
      }

      // Update local matches state so ranking updates immediately
      setMatches(prev => prev.map(m => {
        const updated = resultsArray.find(r => r.match_id === m.id)
        if (updated) {
          return { ...m, score_team1: updated.score_team1, score_team2: updated.score_team2, status: 'finished' }
        }
        return m
      }))
      
      alert('¡Resultados Reales guardados exitosamente!')
    } catch (err) {
      console.error(err)
      alert(`No se pudo guardar: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }




  // Save current user predictions
  const savePredictions = async () => {
    if (!userName.trim() || !userCedula.trim() || !userEmail.trim()) {
      alert("Por favor ingresa tu Nombre, Cédula y Email.")
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(userEmail.trim())) {
      alert("Email inválido.")
      return
    }

    const groupMatches = matches.filter(m => m.id <= 72)
    const missingMatch = groupMatches.find(match => {
      if (isMatchStarted(match.date)) return false
      const pred = predictions[match.id]
      return !pred || pred.team1 === undefined || pred.team1 === null || pred.team2 === undefined || pred.team2 === null
    })

    if (missingMatch) {
      alert(`Falta el Partido ${missingMatch.id}.`)
      return
    }

    setIsSaving(true)
    
    try {
      // 1. Ensure the participant profile exists or is updated
      await supabase.from('participantes').upsert({
        cedula: userCedula.trim(),
        nombre: userName.trim(),
        email: userEmail.trim(),
        updated_at: new Date().toISOString()
      })

      // 2. Check existing quinielas for this cedula
      const { data: existing } = await supabase
        .from('quinielas')
        .select('id, nombre')
        .eq('cedula', userCedula.trim())
      
      const toUpdate = existing?.find(q => q.nombre.trim().toLowerCase() === userName.trim().toLowerCase())

      if (!toUpdate && existing && existing.length >= 3) {
        alert("Ya tienes 3 quinielas registradas con esta cédula. No puedes crear más (puedes usar el mismo nombre para actualizar una existente).")
        setIsSaving(false)
        return
      }

      if (toUpdate) {
        // Update existing quiniela entry
        const { error } = await supabase.from('quinielas').update({
          predicciones: predictions,
          email: userEmail.trim(),
          updated_at: new Date().toISOString()
        }).eq('id', toUpdate.id)
        if (error) throw error
      } else {
        // Insert new quiniela entry
        const { error } = await supabase.from('quinielas').insert({
          nombre: userName.trim(),
          cedula: userCedula.trim(),
          email: userEmail.trim(),
          predicciones: predictions
        })
        if (error) throw error
      }

      alert('¡Quiniela guardada exitosamente!')
      resetForm()
      window.location.reload() 
    } catch (err) {

      console.error(err)
      alert("Error al guardar: " + (err.message || "Error desconocido"))
    } finally {
      setIsSaving(false)
    }
  }

  const sendEmail = () => {
    let message = `Hola ${userName},\n\nAquí tienes un resumen de tus predicciones para la Quiniela Mundial 2026:\n\n`
    const groupMatches = matches.filter(m => m.id <= 72)
    groupMatches.forEach(match => {
      const pred = predictions[match.id]
      if (pred) {
        message += `Partido ${match.id}: ${getTeamName(match.team1_id)} ${pred.team1} - ${pred.team2} ${getTeamName(match.team2_id)}\n`
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
           alert(`¡Predicciones de ${userName} guardadas y correo enviado exitosamente!`);
           resetForm();
        }, (err) => {
           console.log('FAILED...', err);
           alert(`¡Predicciones guardadas! (Pero hubo un error enviando el correo)`);
           resetForm();
        })
        .finally(() => setIsSaving(false));
    } else {
      alert(`¡Predicciones de ${userName} guardadas exitosamente!`)
      resetForm();
      setIsSaving(false)
    }
  }

  const resetForm = () => {
    setUserName('')
    setUserCedula('')
    setUserEmail('')
    setPredictions({})
  }


  // Calculate points for the group standings (based on predictions OR real results)
  const calculateStandings = (matchData) => {
    const standings = {}
    Object.keys(groups).forEach(groupName => {
      standings[groupName] = groups[groupName].map(team => ({
        ...team, points: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, played: 0, won: 0, drawn: 0, lost: 0
      }))
    })

    matches.forEach(match => {
      const pred = matchData[match.id]
      if (pred && pred.team1 !== undefined && pred.team1 !== null && 
          pred.team2 !== undefined && pred.team2 !== null) {
        
        let matchGroup = null
        let t1Index = -1
        let t2Index = -1

        for (const [groupName, teams] of Object.entries(standings)) {
          const i1 = teams.findIndex(t => t.id === match.team1_id)
          const i2 = teams.findIndex(t => t.id === match.team2_id)
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
    let playedMatchesCount = 0
    const groupMatches = matches.filter(m => m.id <= 72)
    
    groupMatches.forEach(match => {
      if (match.score_team1 !== null && match.score_team2 !== null) {
          playedMatchesCount += 1
      }
    })

    const totalGroupMatches = groupMatches.length
    const remainingMatches = totalGroupMatches - playedMatchesCount
    const maxPossiblePoints = playedMatchesCount * 3

    const scores = []
    for (const [id, userData] of Object.entries(allQuinielas)) {
      let points = 0
      let exactMatches = 0
      let partialMatches = 0
      const matchPoints = {}
      
      const userPreds = userData.predictions
      const userName = userData.name

      groupMatches.forEach(match => {
        let pts = 0
        const real1 = match.score_team1
        const real2 = match.score_team2
        const pred = userPreds[match.id]
        
        if (real1 !== null && real2 !== null && pred && pred.team1 !== null && pred.team2 !== null) {
            if (real1 === pred.team1 && real2 === pred.team2) {
              pts = 3
              points += 3
              exactMatches += 1
            } else if (
              (real1 > real2 && pred.team1 > pred.team2) ||
              (real1 < real2 && pred.team1 < pred.team2) ||
              (real1 === real2 && pred.team1 === pred.team2)
            ) {
              pts = 1
              points += 1
              partialMatches += 1
            }
        }
        matchPoints[match.id] = pts
      })
      scores.push({ id, name: userName, points, exactMatches, partialMatches, matchPoints, predictions: userPreds })
    }
    
    return {
      playedMatches: playedMatchesCount,
      remainingMatches,
      maxPossiblePoints,
      totalGroupMatches,
      groupMatches, // Exporting this for the table headers
      scores: scores.sort((a, b) => b.points - a.points)
    }
  }, [allQuinielas, matches, realResults])

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
            {[
              { name: 'Jornada 1', range: [1, 24] },
              { name: 'Jornada 2', range: [25, 48] },
              { name: 'Jornada 3', range: [49, 72] }
            ].map((jornada, jIdx) => {
              const jornadaMatches = matches.filter(m => m.id >= jornada.range[0] && m.id <= jornada.range[1])
              return (
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
                    {jornadaMatches.map((match, idx) => {
                      const dateStr = match.date ? new Date(match.date).toLocaleDateString() : 'TBD'
                      const started = isMatchStarted(match.date)
                      return (
                        <div key={match.id} className={`glass-panel match-card ${started ? 'match-started' : ''}`} style={{ animationDelay: `${(idx % 10) * 0.05}s` }}>
                          <div className="match-info">
                            Partido {match.id} | {dateStr} {started && <span className="started-badge">Iniciado / Finalizado</span>}
                          </div>
                          <div className="match-teams">
                            <div className="team">{getTeamName(match.team1_id)}</div>
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
                            <div className="team">{getTeamName(match.team2_id)}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  )}
                </div>
              )
            })}
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
            {[
              { name: 'Jornada 1', range: [1, 24] },
              { name: 'Jornada 2', range: [25, 48] },
              { name: 'Jornada 3', range: [49, 72] }
            ].map((jornada, jIdx) => {
              const jornadaMatches = matches.filter(m => m.id >= jornada.range[0] && m.id <= jornada.range[1])
              return (
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
                    {jornadaMatches.map((match, idx) => {
                      const dateStr = match.date ? new Date(match.date).toLocaleDateString() : 'TBD'
                      const real = realResults[match.id]
                      const isFilled = real && real.team1 !== null && real.team1 !== undefined && real.team2 !== null && real.team2 !== undefined
                      return (
                        <div key={match.id} className={`glass-panel match-card admin-card ${isFilled ? 'admin-filled' : ''}`}>
                          <div className="match-info">Partido {match.id} | {dateStr}</div>
                          <div className="match-teams">
                            <div className="team">{getTeamName(match.team1_id)}</div>
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
                            <div className="team">{getTeamName(match.team2_id)}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  )}
                </div>
              )
            })}
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

          <div className="ranking-container glass-panel" style={{ overflowX: 'auto', padding: '0' }}>
            {rankingInfo.scores.length === 0 ? (
              <p style={{textAlign: 'center', padding: '2rem'}}>Aún no hay quinielas registradas.</p>
            ) : (
              <table className="consolidated-table">
                <thead>
                  <tr>
                    <th className="sticky-col first-col">Pos</th>
                    <th className="sticky-col second-col">Participante</th>
                    <th>Total</th>
                    <th>Ex</th>
                    <th>Pa</th>
                    {rankingInfo.groupMatches.map(m => (
                      <th key={m.id} title={`${getTeamName(m.team1_id)} vs ${getTeamName(m.team2_id)}`}>
                        P{m.id}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rankingInfo.scores.map((user, idx) => {
                    const distinctPoints = [...new Set(rankingInfo.scores.map(s => s.points))]
                    const place = distinctPoints.indexOf(user.points) + 1
                    const rankClass = place === 1 ? 'rank-1st' : place === 2 ? 'rank-2nd' : place === 3 ? 'rank-3rd' : ''
                    
                    return (
                      <tr key={user.id} className={rankClass}>
                        <td className="sticky-col first-col">{place}</td>
                        <td className="sticky-col second-col">{user.name}</td>
                        <td className="total-pts">{user.points}</td>
                        <td>{user.exactMatches}</td>
                        <td>{user.partialMatches}</td>
                        {rankingInfo.groupMatches.map(m => {
                          const pts = user.matchPoints[m.id] || 0
                          const pred = user.predictions[m.id]
                          const ptsClass = pts === 3 ? 'pts-3' : pts === 1 ? 'pts-1' : ''
                          const scoreText = pred ? `${pred.team1}-${pred.team2}` : '-'
                          
                          return (
                            <td key={m.id} className={ptsClass}>
                              <div style={{fontSize: '0.8rem'}}>{scoreText}</div>
                              {pts > 0 && <div style={{fontSize: '0.7rem', fontWeight: 800}}>({pts})</div>}
                            </td>
                          )
                        })}

                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

export default App
