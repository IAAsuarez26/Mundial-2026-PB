// Quiniela Mundial 2026 - v1.0.2 - Authorized Sync: 2026-05-10 21:23
import { useState, useEffect, useMemo } from 'react'
import emailjs from '@emailjs/browser'
import { supabase } from './supabaseClient'
import './App.css'
import trophyImg from './assets/trophy.png'
import mascotImg from './assets/mascot.png'
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
  const [expandedJornadas, setExpandedJornadas] = useState({})
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
  const [showRulesModal, setShowRulesModal] = useState(false)
  const [showManualModal, setShowManualModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)

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
    const missingMatches = groupMatches.filter(match => {
      if (isMatchStarted(match.date)) return false
      const pred = predictions[match.id]
      return !pred || pred.team1 === null || pred.team1 === undefined || pred.team2 === null || pred.team2 === undefined
    })

    if (missingMatches.length > 0) {
      alert(`Debes completar los 72 pronósticos de la Fase de Grupos para poder guardar. Te faltan ${missingMatches.length} partidos por llenar.`)
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

      try {
        await sendEmail()
        setShowSuccessModal(true)
      } catch (emailErr) {
        console.error("Email failed:", emailErr)
        // Even if email fails, it was saved in DB
        setShowSuccessModal(true) 
      }
      
      // resetForm() // We might want to keep the data visible for a moment
      // window.location.reload() 
    } catch (err) {

      console.error(err)
      alert("Error al guardar: " + (err.message || "Error desconocido"))
    } finally {
      setIsSaving(false)
    }
  }

  const sendEmail = () => {
    // Reusable short style strings
    const BD = 'border:1px solid #ddd'               // border
    const CA = `${BD};text-align:center`              // center-aligned stat cell
    const HDR = 'background:#003366;color:#fff'       // header row

    // 1. Build standings tables using email-safe HTML attributes (minimized size)
    let standingsHTML = ''
    Object.entries(groupStandings).forEach(([groupName, teams]) => {
      const rows = teams.map((team, i) => {
        const dg = team.goalDiff > 0 ? `+${team.goalDiff}` : `${team.goalDiff}`
        const dgColor = team.goalDiff > 0 ? '#27ae60' : team.goalDiff < 0 ? '#e74c3c' : '#444'
        const bg = i % 2 === 0 ? '#fff' : '#f5f5f5'
        return `<tr align="center" bgcolor="${bg}">` +
          `<td style="color:#999">${i+1}.</td>` +
          `<td align="left" style="font-weight:700">${team.name}</td>` +
          `<td>${team.played}</td>` +
          `<td>${team.won}</td>` +
          `<td>${team.drawn}</td>` +
          `<td>${team.lost}</td>` +
          `<td>${team.goalsFor}</td>` +
          `<td>${team.goalsAgainst}</td>` +
          `<td style="color:${dgColor};font-weight:700">${dg}</td>` +
          `<td style="font-weight:900;color:#003366">${team.points}</td>` +
        `</tr>`
      }).join('')

      standingsHTML +=
        `<p style="font-weight:700;color:#003366;font-size:13px;margin:14px 0 3px">GRUPO ${groupName}</p>` +
        `<table width="100%" cellpadding="4" cellspacing="0" border="1" bordercolor="#dddddd" style="border-collapse:collapse;font-size:11px;margin-bottom:14px">` +
          `<tr align="center" bgcolor="#003366" style="color:#fff">` +
            `<th colspan="2" align="left">Equipo</th>` +
            `<th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>GF</th><th>GC</th><th>DG</th><th>PTS</th>` +
          `</tr>${rows}` +
        `</table>`
    })

    // 2. Compact match predictions table (no long styles needed)
    const matchRows = matches
      .filter(m => m.id <= 72 && predictions[m.id])
      .map(m => {
        const p = predictions[m.id]
        return `<tr><td style="padding:4px 6px;border-bottom:1px solid #eee;font-size:11px">` +
          `<b>${m.id}.</b> ${getTeamName(m.team1_id)} <b>${p.team1} – ${p.team2}</b> ${getTeamName(m.team2_id)}` +
        `</td></tr>`
      }).join('')

    const matchesHTML = `<table width="100%" cellspacing="0" style="border-collapse:collapse">${matchRows}</table>`

    // 3. Final email wrapper
    const emailHTML =
      `<div style="background:#f0f2f5;padding:16px;font-family:Arial,sans-serif">` +
      `<table width="100%" style="max-width:600px;margin:0 auto;background:#003366;border-radius:8px 8px 0 0">` +
        `<tr><td style="padding:18px;text-align:center">` +
          `<h1 style="color:#fff;margin:0;font-size:20px">Posiciones según tus Pronósticos</h1>` +
          `<p style="color:#aad4f5;margin:6px 0 0;font-size:13px">Quiniela Mundial 2026 · ${userName}</p>` +
        `</td></tr>` +
      `</table>` +
      `<table width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:0 0 8px 8px">` +
        `<tr><td style="padding:20px">` +
          `<h2 style="color:#003366;border-bottom:2px solid #eee;padding-bottom:8px;font-size:15px;margin-top:0">Posiciones Proyectadas</h2>` +
          standingsHTML +
          `<h2 style="color:#003366;border-bottom:2px solid #eee;padding-bottom:8px;font-size:15px;margin-top:20px">Tus Pronósticos</h2>` +
          matchesHTML +
        `</td></tr>` +
      `</table>` +
      `<p style="text-align:center;font-size:11px;color:#999;margin-top:10px">Enviado automáticamente · Quiniela Mundial 2026</p>` +
      `</div>`

    const templateParams = {
      to_name: userName,
      to_email: userEmail.trim(),
      message: emailHTML
    }

    const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID
    const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
    const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

    if (!SERVICE_ID || SERVICE_ID === "YOUR_SERVICE_ID_HERE") {
      return Promise.resolve()
    }

    console.log(`[Email] HTML size: ${emailHTML.length} chars`)
    console.log(`[Email] DEBUG ENV VARS -> Service: "${SERVICE_ID}", Template: "${TEMPLATE_ID}", PublicKey: "${PUBLIC_KEY ? PUBLIC_KEY.substring(0,4) + '...' : 'MISSING'}"`)

    return emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY)
      .then((response) => {
         console.log('[Email] SUCCESS!', response.status, response.text);
      }, (err) => {
         console.error('[Email] FAILED:', err);
         throw err
      });
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
        id: team.id,
        name: team.name,
        group_letter: team.group_letter,
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0
      }))
    })

    matches.forEach(match => {
      const pred = matchData[match.id]
      if (pred && pred.team1 !== undefined && pred.team1 !== null && 
          pred.team2 !== undefined && pred.team2 !== null) {
        
        let matchGroup = null
        let t1Index = -1
        let t2Index = -1

        for (const [groupName, groupTeams] of Object.entries(standings)) {
          const i1 = groupTeams.findIndex(t => t.id === match.team1_id)
          const i2 = groupTeams.findIndex(t => t.id === match.team2_id)
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
          
          const team1 = standings[matchGroup][t1Index]
          const team2 = standings[matchGroup][t2Index]

          team1.goalsFor += s1
          team1.goalsAgainst += s2
          team1.goalDiff += (s1 - s2)
          team1.played += 1
          
          team2.goalsFor += s2
          team2.goalsAgainst += s1
          team2.goalDiff += (s2 - s1)
          team2.played += 1

          if (s1 > s2) {
            team1.points += 3
            team1.won += 1
            team2.lost += 1
          } else if (s1 < s2) {
            team2.points += 3
            team2.won += 1
            team1.lost += 1
          } else {
            team1.points += 1
            team2.points += 1
            team1.drawn += 1
            team2.drawn += 1
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
    const maxPossiblePoints = playedMatchesCount * 5

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
            const realDiff = real1 - real2
            const predDiff = pred.team1 - pred.team2
            const realSign = Math.sign(realDiff)
            const predSign = Math.sign(predDiff)

            if (real1 === pred.team1 && real2 === pred.team2) {
              pts = 5
              exactMatches += 1
            } else if (realDiff === predDiff) {
              pts = 3
              partialMatches += 1
            } else if (realSign === predSign && realSign !== 0) {
              pts = 1
              partialMatches += 1
            }
            points += pts
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
      <div className="banner-triptych" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2rem', marginBottom: '2.5rem', width: '100%' }}>
        <div className="banner-item float-anim" style={{ width: '25%', display: 'flex', justifyContent: 'center', alignItems: 'center', animationDelay: '0s' }}>
          <img 
            src={trophyImg} 
            alt="Copa del Mundo" 
            style={{ width: '100%', height: 'auto', display: 'block', opacity: '0.95', pointerEvents: 'none' }}
          />
        </div>
        <div className="banner-item glass-panel" style={{ width: '25%', overflow: 'hidden', border: '1px solid rgba(0, 242, 254, 0.3)', boxShadow: '0 10px 40px rgba(0, 0, 0, 0.6)' }}>
          <img 
            src="https://images.unsplash.com/photo-1579952363873-27f3bade9f55?q=80&w=1600&auto=format&fit=crop" 
            alt="Botín y Balón" 
            style={{ width: '100%', height: 'auto', display: 'block', opacity: '0.9', pointerEvents: 'none' }}
          />
        </div>
        <div className="banner-item float-anim" style={{ width: '25%', display: 'flex', justifyContent: 'center', alignItems: 'center', animationDelay: '1s' }}>
          <img 
            src={mascotImg} 
            alt="Mascotas Mundial 2026" 
            style={{ width: '100%', height: 'auto', display: 'block', opacity: '0.95', pointerEvents: 'none' }}
          />
        </div>
      </div>
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
          Quiniela Mundial de Fútbol <span className="text-gradient">2026</span>
        </h1>
        <div className="nav-tabs">
          <div className="tabs-center">
            <button className={`tab-btn ${currentView === 'predict' ? 'active' : ''}`} onClick={() => setCurrentView('predict')}>Mis Predicciones</button>
            <button className={`tab-btn ${currentView === 'ranking' ? 'active' : ''}`} onClick={() => setCurrentView('ranking')}>Ranking</button>
            <button className={`tab-btn ${currentView === 'admin' ? 'active' : ''}`} onClick={() => setCurrentView('admin')}>Administrador</button>
            <button className="tab-btn manual-btn" onClick={() => setShowManualModal(true)}>📖 Manual</button>
            <button className="tab-btn rules-btn" onClick={() => setShowRulesModal(true)}>📜 Reglamento</button>
          </div>
        </div>
      </header>

      {currentView === 'predict' && (
        <>
          <div className="user-input-section" style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
            <div style={{display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap'}}>
              <input 
                type="text" 
                className="user-name-input glass-panel" 
                placeholder="Cédula / DNI / Pasaporte"
                title="Documento de Identidad"
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
          </div>



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
                      const pred = predictions[match.id]
                      const isFilled = pred && pred.team1 !== null && pred.team1 !== undefined && pred.team1 !== '' && pred.team2 !== null && pred.team2 !== undefined && pred.team2 !== ''
                      
                      return (
                        <div key={match.id} className={`glass-panel match-card ${started ? 'match-started' : ''} ${isFilled ? 'prediction-filled' : ''}`} style={{ animationDelay: `${(idx % 10) * 0.05}s` }}>
                          <div className="match-info">
                            Partido {match.id} | {dateStr} {started && <span className="started-badge">Iniciado / Finalizado</span>}
                          </div>
                          <div className="match-teams">
                            <div className="team">{getTeamName(match.team1_id)}</div>
                            <input 
                              type="number" min="0" className="team-input"
                              value={predictions[match.id]?.team1 ?? ''}
                              onChange={(e) => handleScoreChange(match.id, 'team1', e.target.value)}
                              onKeyDown={(e) => ['e', 'E', '+', '-', '.', ','].includes(e.key) && e.preventDefault()}
                              placeholder="0"
                              disabled={started}
                            />
                            <span className="vs-badge">VS</span>
                            <input 
                              type="number" min="0" className="team-input"
                              value={predictions[match.id]?.team2 ?? ''}
                              onChange={(e) => handleScoreChange(match.id, 'team2', e.target.value)}
                              onKeyDown={(e) => ['e', 'E', '+', '-', '.', ','].includes(e.key) && e.preventDefault()}
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



          <section className="groups-section" style={{marginTop: '3rem'}}>
            <div 
              className="jornada-header-toggle glass-panel" 
              onClick={() => setShowGroups(prev => !prev)}
              style={{cursor: 'pointer', padding: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}
            >
              <h3 className="text-gradient" style={{margin: 0, fontSize: '1.5rem'}}>Posiciones por grupo</h3>
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

          <div style={{display: 'flex', justifyContent: 'center', marginTop: '3rem', marginBottom: '3rem'}}>
            <button className="save-btn" onClick={savePredictions} disabled={isSaving} style={{padding: '1.2rem 3rem', fontSize: '1.2rem'}}>
              {isSaving ? 'Guardando...' : '¡Guardar mi Quiniela!'}
            </button>
          </div>

          {showSuccessModal && (
            <div className="modal-overlay">
              <div className="modal-content glass-panel" style={{textAlign: 'center', maxWidth: '450px'}}>
                <div style={{marginBottom: '1rem'}}>
                  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                </div>
                <h2 className="text-gradient" style={{margin: '0 0 1rem'}}>¡Quiniela Guardada!</h2>
                <p style={{fontSize: '1.05rem', color: 'var(--text-muted)', lineHeight: '1.7', marginBottom: '0.5rem'}}>
                  Tus pronósticos han sido guardados <strong style={{color: '#2ecc71'}}>exitosamente</strong>.
                </p>
                <p style={{fontSize: '1.05rem', color: 'var(--text-muted)', lineHeight: '1.7', marginBottom: '2rem'}}>
                  Se ha enviado un reporte detallado a:<br/>
                  <strong style={{color: 'white'}}>{userEmail}</strong>
                </p>
                <button className="save-btn" onClick={() => window.location.reload()} style={{width: '100%', fontSize: '1.1rem'}}>
                  ¡Entendido!
                </button>
              </div>
            </div>
          )}
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
                              onKeyDown={(e) => ['e', 'E', '+', '-', '.', ','].includes(e.key) && e.preventDefault()}
                              placeholder="-"
                            />
                            <span className="vs-badge">VS</span>
                            <input 
                              type="number" min="0" className="team-input admin-input"
                              value={realResults[match.id]?.team2 ?? ''}
                              onChange={(e) => handleRealScoreChange(match.id, 'team2', e.target.value)}
                              onKeyDown={(e) => ['e', 'E', '+', '-', '.', ','].includes(e.key) && e.preventDefault()}
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

          <div className="stats-dashboard glass-panel-heavy" style={{marginBottom: '2rem', padding: '1.5rem', display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: '1rem'}}>
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
                  {/* Real Results Row */}
                  <tr style={{ background: 'rgba(0, 242, 254, 0.1)', fontWeight: 'bold' }}>
                    <td className="sticky-col first-col" style={{ background: 'rgba(0, 150, 160, 0.95)' }}>-</td>
                    <td className="sticky-col second-col" style={{ background: 'rgba(0, 150, 160, 0.95)', color: 'var(--primary-color)' }}>RESULTADO REAL</td>
                    <td colSpan="3" style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Score Oficial</td>
                    {rankingInfo.groupMatches.map(m => {
                      const isFinished = m.score_team1 !== null && m.score_team2 !== null;
                      return (
                        <td key={m.id} style={{ color: isFinished ? 'var(--primary-color)' : '#888' }}>
                          {isFinished ? `${m.score_team1}-${m.score_team2}` : 'NP'}
                        </td>
                      );
                    })}
                  </tr>
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
                          const isFinished = m.score_team1 !== null && m.score_team2 !== null
                          let ptsClass = ''
                          if (isFinished) {
                            if (pts === 5) ptsClass = 'pts-5'
                            else if (pts === 3) ptsClass = 'pts-3'
                            else if (pts === 1) ptsClass = 'pts-1'
                            else ptsClass = 'pts-0'
                          }
                          const scoreText = pred ? `${pred.team1}-${pred.team2}` : '-'
                          
                          return (
                            <td key={m.id} className={ptsClass}>
                              <div style={{fontSize: '0.8rem'}}>{scoreText}</div>
                              {pts > 0 && <div style={{fontSize: '0.7rem', fontWeight: 800}}>({pts})</div>}
                              {isFinished && pts === 0 && <div style={{fontSize: '0.7rem', fontWeight: 800}}>(0)</div>}
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

      {/* Rules Modal */}
      {showRulesModal && (
        <div className="modal-overlay" onClick={() => setShowRulesModal(false)}>
          <div className="modal-content glass-panel" onClick={e => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setShowRulesModal(false)}>&times;</button>
            <h2 className="text-gradient">Reglamento Mundial de Fútbol 2026</h2>
            
            <div className="rules-section">
              <h3>⚽ Sistema de Puntuación (Fase de Grupos)</h3>
              <div className="rules-grid">
                <div className="rule-card pts-5">
                  <div className="rule-pts">5 Pts</div>
                  <div className="rule-desc"><strong>Resultado Exacto:</strong> Acertar el marcador idéntico del partido.</div>
                </div>
                <div className="rule-card pts-3">
                  <div className="rule-pts">3 Pts</div>
                  <div className="rule-desc"><strong>Ganador y Diferencia:</strong> Acertar el ganador y la diferencia de goles, o empate no exacto.</div>
                </div>
                <div className="rule-card pts-1">
                  <div className="rule-pts">1 Pt</div>
                  <div className="rule-desc"><strong>Tendencia:</strong> Acertar únicamente el equipo ganador pero fallar en la diferencia de goles.</div>
                </div>
              </div>
            </div>

            <div className="rules-section">
              <h3>📋 Condiciones Generales</h3>
              <ul>
                <li>Se permite un máximo de <strong>3 quinielas</strong> por participante (usando el mismo documento de identidad pero distinto apodo).</li>
                <li>Los pronósticos se pueden realizar hasta 24 horas antes del primer partido del Mundial.</li>
                <li>La transparencia es total: todos pueden ver los pronósticos de los demás en la pestaña de Ranking.</li>
              </ul>
            </div>

            <button className="btn-primary" onClick={() => setShowRulesModal(false)} style={{width: '100%', marginTop: '1rem'}}>Entendido</button>
          </div>
        </div>
      )}

      {/* Manual Modal */}
      {showManualModal && (
        <div className="modal-overlay" onClick={() => setShowManualModal(false)}>
          <div className="modal-content glass-panel" onClick={e => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setShowManualModal(false)}>&times;</button>
            <h2 className="text-gradient">Guía de Llenado Correcto</h2>
            
            <div className="rules-section">
              <div className="manual-step">
                <div className="step-num">1</div>
                <div className="step-text">
                  <strong>Identificación:</strong> Ingresa tu Documento de Identidad (Cédula, DNI o Pasaporte), Nombre (o apodo) y Correo Electrónico. Recuerda que el correo es vital para recibir tu comprobante.
                </div>
              </div>
              <div className="manual-step">
                <div className="step-num">2</div>
                <div className="step-text">
                  <strong>Pronósticos:</strong> Coloca los goles en los cuadros blancos. Los bordes de la tarjeta se pondrán <span style={{color: '#2ecc71', fontWeight: 'bold'}}>Verdes</span> cuando hayas completado ambos campos de un partido.
                </div>
              </div>
              <div className="manual-step">
                <div className="step-num">3</div>
                <div className="step-text">
                  <strong>Tablas de Posiciones:</strong> A medida que llenas los goles, las tablas se actualizarán automáticamente. Revisa que tus equipos favoritos queden en la posición deseada <strong>antes de guardar</strong>, ya que al presionar el botón de guardado el formulario se enviará y se limpiará para un nuevo registro.
                </div>
              </div>
              <div className="manual-step">
                <div className="step-num">4</div>
                <div className="step-text">
                  <strong>Guardar:</strong> Al finalizar los 72 partidos de la Fase de Grupos, haz clic en el botón <span style={{color: 'var(--primary-color)', fontWeight: 'bold'}}>"Guardar mi Quiniela"</span>.
                </div>
              </div>
              <div className="manual-step">
                <div className="step-num">5</div>
                <div className="step-text">
                  <strong>Confirmación:</strong> Espera el mensaje de éxito. Recibirás un correo con el detalle de todos tus pronósticos para tu control personal.
                </div>
              </div>
            </div>

            <button className="btn-primary" onClick={() => setShowManualModal(false)} style={{width: '100%', marginTop: '1rem'}}>¡Listo, a jugar!</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
