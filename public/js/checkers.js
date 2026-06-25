// References:
// https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
// https://developer.mozilla.org/en-US/docs/Web/API/requestAnimationFrame
// https://www.w3schools.com/jsref/jsref_obj_array.asp
// https://en.wikipedia.org/wiki/Draughts

document.addEventListener('DOMContentLoaded', function() {
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const gameInfo = document.getElementById("gameInfo");

  if (!canvas || !ctx) return;

  const BOARD_SIZE = 8;
  const SQUARE_SIZE = canvas.width / BOARD_SIZE;

  // Web
  
  let audioContext;
  let soundEnabled = true;

  // Audio 
  
  function initAudio() {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.log('Web Audio API not supported');
      soundEnabled = false;
    }
  }

  function playSound(frequency, duration, type = 'sine') {
    if (!soundEnabled || !audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = type;
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  }

  // Sound effectts
  function playMoveSound() {
    playSound(400, 0.1, 'triangle'); 
  }

  function playCaptureSound() {
    playSound(200, 0.2, 'square'); 
  }

  function playKingSound() {
    playSound(500, 0.15, 'sine');
    setTimeout(() => playSound(600, 0.15, 'sine'), 100);
    setTimeout(() => playSound(700, 0.15, 'sine'), 200);
  }

  function playGameOverSound(winner) {
    if (winner === 'W') {
      playSound(523, 0.2, 'sine'); 
      setTimeout(() => playSound(659, 0.2, 'sine'), 200); 
      setTimeout(() => playSound(784, 0.3, 'sine'), 400); 
    } else {
      playSound(440, 0.2, 'sine'); // A
      setTimeout(() => playSound(554, 0.2, 'sine'), 200); 
      setTimeout(() => playSound(659, 0.3, 'sine'), 400); 
    }
  }

  // Audio 
  function enableAudio() {
    if (!audioContext) {
      initAudio();
      document.removeEventListener('click', enableAudio);
      document.removeEventListener('keydown', enableAudio);
    }
  }
  document.addEventListener('click', enableAudio);
  document.addEventListener('keydown', enableAudio);

  // Game 
  let board = [];
  let currentPlayer = "W"; 
  let selectedPiece = null;
  let mustJump = false;
  let gameOver = false;

  // AI
  let aiMode = false;
  let aiThinking = false;
  const AI_PLAYER = 'B';
  const AI_DEPTH = 6;

  // Coordinate conversion helper
  function rowColToSquare(row, col) {
    const files = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const rank = (8 - row).toString();
    return files[col] + rank;
  }

  // Win cond
  function checkWinCondition() {
    let whitePieces = 0;
    let blackPieces = 0;
    let whiteCanMove = false;
    let blackCanMove = false;
    
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (piece.includes("W")) {
          whitePieces++;
          if (!whiteCanMove && canMove(row, col, piece)) whiteCanMove = true;
        } else if (piece.includes("B")) {
          blackPieces++;
          if (!blackCanMove && canMove(row, col, piece)) blackCanMove = true;
        }
      }
    }
    
    if (whitePieces === 0 || !whiteCanMove) {
      gameOver = true;
      gameInfo.textContent = "BLACK WINS!";
      playGameOverSound('B');
      return true;
    }
    if (blackPieces === 0 || !blackCanMove) {
      gameOver = true;
      gameInfo.textContent = "WHITE WINS!";
      playGameOverSound('W');
      return true;
    }
    return false;
  }

  function canMove(row, col, piece) {
    const isKing = piece.includes("K");
    const directions = isKing ? 
      [[-1,-1], [-1,1], [1,-1], [1,1]] : 
      piece.includes("W") ? [[1,-1], [1,1]] : [[-1,-1], [-1,1]];
    
    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;
      if (newRow >= 0 && newRow < BOARD_SIZE && newCol >= 0 && newCol < BOARD_SIZE) {
        if (!board[newRow][newCol]) return true;
        
        const jumpRow = row + dr * 2;
        const jumpCol = col + dc * 2;
        if (jumpRow >= 0 && jumpRow < BOARD_SIZE && jumpCol >= 0 && jumpCol < BOARD_SIZE &&
            !board[newRow][newCol].includes(piece[0]) && !board[jumpRow][jumpCol]) {
          return true;
        }
      }
    }
    return false;
  }

  // Movement stuff
  function canJump(row, col, player) {
    const directions = player.includes("K") ? 
      [[-1,-1], [-1,1], [1,-1], [1,1]] : 
      player.includes("W") ? [[1,-1], [1,1]] : [[-1,-1], [-1,1]];
    
    for (const [dr, dc] of directions) {
      const jumpRow = row + dr * 2;
      const jumpCol = col + dc * 2;
      if (jumpRow >= 0 && jumpRow < BOARD_SIZE && jumpCol >= 0 && jumpCol < BOARD_SIZE &&
          board[row + dr][col + dc] && !board[row + dr][col + dc].includes(player[0]) &&
          !board[jumpRow][jumpCol]) {
        return true;
      }
    }
    return false;
  }

  // Movement upfdates
  const PST_BLACK = [
    [0,  0,  0,  0,  0,  0,  0,  0],  // row 0 — promotion row (pieces become kings)
    [0,  6,  0,  6,  0,  6,  0,  6],  // row 1 — almost promoted
    [5,  0,  5,  0,  5,  0,  5,  0],  // row 2
    [0,  3,  0,  4,  0,  4,  0,  3],  // row 3 — centre control
    [2,  0,  3,  0,  3,  0,  2,  0],  // row 4 — midfield
    [0,  1,  0,  2,  0,  2,  0,  1],  // row 5 — just behind start
    [1,  0,  1,  0,  1,  0,  1,  0],  // row 6
    [0,  0,  0,  0,  0,  0,  0,  0],  // row 7 — Black start row
  ];
  // PST for White is the vertical mirror of Black's table
  const PST_WHITE = PST_BLACK.map(r => [...r]).reverse();

  // Static board evaluation — positive = good for AI (Black)
  function evaluateBoard(b) {
    let score = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = b[r][c];
        if (!p) continue;
        const isB  = p[0] === 'B';
        const isK  = p.includes('K');
        const sign = isB ? 1 : -1;
        //  king = 1.75× a regular piece
        score += sign * (isK ? 175 : 100);
        if (!isK) score += sign * (isB ? PST_BLACK[r][c] : PST_WHITE[r][c]);
        if (!isK) {
          if ( isB && r === 7) score += 15;
          if (!isB && r === 0) score -= 15;
        }
      }
    }
    return score;
  }

  // Returns jumps array when any jump is available 
  function getMoves(b, player) {
    const moves = [], jumps = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = b[r][c];
        if (!p || p[0] !== player) continue;
        const isK = p.includes('K');
        const dirs = isK
          ? [[-1,-1],[-1,1],[1,-1],[1,1]]
          : player === 'W' ? [[1,-1],[1,1]] : [[-1,-1],[-1,1]];
        for (const [dr, dc] of dirs) {
          const nr = r+dr, nc = c+dc;
          if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
          if (!b[nr][nc]) {
            moves.push([r, c, nr, nc]);
          } else if (b[nr][nc][0] !== player) {
            const jr = r+dr*2, jc = c+dc*2;
            if (jr >= 0 && jr < BOARD_SIZE && jc >= 0 && jc < BOARD_SIZE && !b[jr][jc]) {
              jumps.push([r, c, jr, jc]);
            }
          }
        }
      }
    }
    return jumps.length ? jumps : moves;
  }

  // Return a new board with move 
  function applyMove(b, move) {
    const [fr, fc, tr, tc] = move;
    const nb = b.map(r => [...r]);
    const p = nb[fr][fc];
    nb[tr][tc] = (p === 'W' && tr === BOARD_SIZE-1) ? 'WK'
               : (p === 'B' && tr === 0)             ? 'BK'
               : p;
    nb[fr][fc] = '';
    if (Math.abs(tr-fr) === 2) nb[fr+(tr-fr)/2][fc+(tc-fc)/2] = '';
    return nb;
  }

  // a-b pruning.
  // `maximize` is true when we're evaluating from the perspective of the AI (Black).
  // Returns [bestScore, bestMove].
  function minimax(b, depth, alpha, beta, maximize) {
    const player = maximize ? 'B' : 'W';
    const moves  = getMoves(b, player);
    if (depth === 0 || !moves.length) return [evaluateBoard(b), null];
    let best = maximize ? -Infinity : Infinity;
    let bestMove = null;
    for (const mv of moves) {
      const [s] = minimax(applyMove(b, mv), depth-1, alpha, beta, !maximize);
      if (maximize ? s > best : s < best) { best = s; bestMove = mv; }
      if (maximize) alpha = Math.max(alpha, best);
      else          beta  = Math.min(beta,  best);
      if (beta <= alpha) break; // prune — this branch won't be chosen
    }
    return [best, bestMove];
  }

  // AI turn on the live board.
  // Handles  multi-jump chains by calling itself multiple times.
  function doAIMove() {
    if (!aiMode || gameOver || currentPlayer[0] !== AI_PLAYER) return;
    aiThinking = true;
    gameInfo.textContent = "AI is thinking…";

    setTimeout(() => {
      let move;
      if (mustJump && selectedPiece) {
        // do A forced multi-jump from the piece that just captured
        const p    = board[selectedPiece.row][selectedPiece.col];
        const isK  = p.includes('K');
        const dirs = isK ? [[-1,-1],[-1,1],[1,-1],[1,1]] : [[-1,-1],[-1,1]];
        for (const [dr, dc] of dirs) {
          const mr = selectedPiece.row+dr,  mc = selectedPiece.col+dc;
          const jr = selectedPiece.row+dr*2, jc = selectedPiece.col+dc*2;
          if (jr >= 0 && jr < BOARD_SIZE && jc >= 0 && jc < BOARD_SIZE &&
              board[mr]?.[mc]?.[0] === 'W' && !board[jr][jc]) {
            move = [selectedPiece.row, selectedPiece.col, jr, jc];
            break;
          }
        }
      } else {
        const [, best] = minimax(board, AI_DEPTH, -Infinity, Infinity, true);
        move = best;
      }

      if (move) {
        const cont = makeMove(move[0], move[1], move[2], move[3]);
        render();
        if (!cont) { doAIMove(); return; } // multi-jump — keep going
      }
      aiThinking = false;
      render();
    }, 250);
  }

  function makeMove(fromRow, fromCol, toRow, toCol) {
    const piece = board[fromRow][fromCol];
    const wasKing = piece.includes("K");
    
    board[toRow][toCol] = piece;
    board[fromRow][fromCol] = "";
    
    let becameKing = false;
    if ((piece.includes("W") && toRow === BOARD_SIZE - 1) || 
        (piece.includes("B") && toRow === 0)) {
      board[toRow][toCol] = piece[0] + "K";
      becameKing = !wasKing;
      if (becameKing) {
        playKingSound();
      }
    }
    
    const rowDiff = Math.abs(toRow - fromRow);
    let wasCaptured = false;
    if (rowDiff === 2) {
      const captureRow = fromRow + (toRow - fromRow) / 2;
      const captureCol = fromCol + (toCol - fromCol) / 2;
      board[captureRow][captureCol] = "";
      wasCaptured = true;
      playCaptureSound();
      
      if (canJump(toRow, toCol, board[toRow][toCol])) {
        selectedPiece = { row: toRow, col: toCol };
        mustJump = true;
        return false;
      }
    } else if (!becameKing) {
      playMoveSound();
    }

    // Report the move after validation
    const fromSquare = rowColToSquare(fromRow, fromCol);
    const toSquare = rowColToSquare(toRow, toCol);
    const side = currentPlayer === "W" ? "red" : "yellow";
    
    if (window.reportMove) {
      window.reportMove(fromSquare, toSquare, { game: "checkers", side: side });
    }
    
    selectedPiece = null;
    mustJump = false;
    currentPlayer = currentPlayer[0] === "W" ? "B" : "W";
    
    if (checkWinCondition()) {
      return true;
    }
    
    return true;
  }

  // Board stufdf
  function setupBoard() {
    board = [];
    let whiteCount = 0, blackCount = 0;
    
    for (let row = 0; row < BOARD_SIZE; row++) {
      board[row] = [];
      for (let col = 0; col < BOARD_SIZE; col++) {
        if ((row + col) % 2 === 1) {
          if (row < 3) {
            board[row][col] = "W"; 
            whiteCount++;
          } else if (row > 4) {
            board[row][col] = "B";  
            blackCount++;
          } else {
            board[row][col] = "";   
          }
        } else {
          board[row][col] = "";     
        }
      }
    }
  }

  // Canvas drawing
  function drawBoard() {
    const isLightTheme = document.body.classList.contains('light-theme');
    
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const x = col * SQUARE_SIZE;
        const y = row * SQUARE_SIZE;
        
        if ((row + col) % 2 === 0) {
          ctx.fillStyle = isLightTheme ? "#ffffff" : "#f0f0f0";  
        } else {
          ctx.fillStyle = isLightTheme ? "#8B4513" : "#2d2d2d";  
        }
        ctx.fillRect(x, y, SQUARE_SIZE, SQUARE_SIZE);

        if (selectedPiece && selectedPiece.row === row && selectedPiece.col === col) {
          ctx.fillStyle = isLightTheme ? "rgba(255, 165, 0, 0.7)" : "rgba(255, 255, 0, 0.7)";
          ctx.fillRect(x + 2, y + 2, SQUARE_SIZE - 4, SQUARE_SIZE - 4);
        }
      }
    }
  }

  function drawPieces() {
    let pieceCount = 0;
    const isLightTheme = document.body.classList.contains('light-theme');
    
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (piece) {
          pieceCount++;
          
          const x = col * SQUARE_SIZE + SQUARE_SIZE / 2;
          const y = row * SQUARE_SIZE + SQUARE_SIZE / 2;
          const radius = SQUARE_SIZE * 0.35;
          
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          
          if (piece.includes("W")) {
            ctx.fillStyle = isLightTheme ? "#f8f8f8" : "white";
            ctx.strokeStyle = isLightTheme ? "#444" : "#333";
          } else {
            ctx.fillStyle = isLightTheme ? "#2c2c2c" : "#1a1a1a";
            ctx.strokeStyle = isLightTheme ? "#ddd" : "#fff";
          }
          
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.stroke();

          if (piece.includes("K")) {
            const time = Date.now() * 0.003; 
            const glowIntensity = 0.5 + 0.5 * Math.sin(time);
            
            ctx.save();
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 15 * glowIntensity;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            ctx.strokeStyle = `rgba(255, 215, 0, ${0.8 + 0.2 * glowIntensity})`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(x, y, radius * 0.7, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.fillStyle = `rgba(255, 215, 0, ${0.9 + 0.1 * glowIntensity})`;
            ctx.font = `bold ${SQUARE_SIZE * 0.4}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("K", x, y);
            
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 2;
            ctx.shadowOffsetY = 2;
            ctx.fillStyle = piece.includes("W") ? "#B8860B" : "#DAA520";
            ctx.fillText("K", x, y);
            
            ctx.restore();
          }
        }
      }
    }
  }

  function render() {
    drawBoard();
    if (board && board.length > 0) { 
      drawPieces();
    }
    if (!gameOver) {
      gameInfo.textContent = `Current Player: ${currentPlayer.includes("W") ? "White" : "Black"}${mustJump ? " - Must Jump!" : ""}`;
    }
  }

  // Animation
  function animate() {
    render();
    requestAnimationFrame(animate);
  }

  // Game startup
  function initGame() {
    setupBoard();
    animate();
  }

  
  initGame();

  // Click suff
  canvas.addEventListener('click', function(e) {
    if (gameOver) return;
    if (aiMode && (currentPlayer[0] === AI_PLAYER || aiThinking)) return;
    
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / SQUARE_SIZE);
    const row = Math.floor((e.clientY - rect.top) / SQUARE_SIZE);
    
    const piece = board[row][col];
    
    if (!mustJump && piece && piece[0] === currentPlayer[0]) {
      selectedPiece = { row, col };
      render();
    }
    else if (selectedPiece && !piece && (row + col) % 2 === 1) {
      const rowDiff = Math.abs(row - selectedPiece.row);
      const colDiff = Math.abs(col - selectedPiece.col);
      const selectedPieceType = board[selectedPiece.row][selectedPiece.col];
      const isKing = selectedPieceType.includes("K");
      const isWhite = selectedPieceType.includes("W");
      const validDirection = isKing || 
        (isWhite && row > selectedPiece.row) || 
        (!isWhite && row < selectedPiece.row);
      
      if (!validDirection) return;
      
      if (rowDiff === 1 && colDiff === 1 && !mustJump) {
        makeMove(selectedPiece.row, selectedPiece.col, row, col);
        render();
        doAIMove();
      }
      else if (rowDiff === 2 && colDiff === 2) {
        const middleRow = selectedPiece.row + (row - selectedPiece.row) / 2;
        const middleCol = selectedPiece.col + (col - selectedPiece.col) / 2;
        const middlePiece = board[middleRow][middleCol];
        
        if (middlePiece && !middlePiece.includes(currentPlayer[0])) {
          makeMove(selectedPiece.row, selectedPiece.col, row, col);
          render();
          if (!mustJump) doAIMove(); // only hand off to AI once player's chain is done
        }
      }
    }
    else if (!mustJump) {
      selectedPiece = null;
      render();
    }
  });

  // restert the game
  function resetGame() {
    currentPlayer = "W";
    selectedPiece = null;
    mustJump = false;
    gameOver = false;
    aiThinking = false;
    setupBoard();
    render();
  }

  // UI shit
  const resetBtn = document.getElementById("resetGame");
  if (resetBtn) {
    resetBtn.addEventListener('click', resetGame);
  }

  const soundBtn = document.getElementById("toggleSound");
  if (soundBtn) {
    soundBtn.addEventListener('click', function() {
      soundEnabled = !soundEnabled;
      soundBtn.textContent = `Sound: ${soundEnabled ? 'ON' : 'OFF'}`;
      if (soundEnabled && !audioContext) {
        initAudio();
      }
    });
  }

  // Theme toggle functionality
  const themeBtn = document.getElementById("toggleTheme");
  if (themeBtn) {
    themeBtn.addEventListener('click', function() {
      const body = document.body;
      const isLightTheme = body.classList.contains('light-theme');
      
      if (isLightTheme) {
        body.classList.remove('light-theme');
        themeBtn.textContent = 'Light Theme';
      } else {
        body.classList.add('light-theme');
        themeBtn.textContent = 'Dark Theme';
      }
    });
  }

  // Back to menu functionality
  const backBtn = document.getElementById("backToMenu");
  if (backBtn) {
    backBtn.addEventListener('click', function() {
      window.location.href = '/';
    });
  }

  // AI toggle
  const aiBtn = document.getElementById("toggleAI");
  if (aiBtn) {
    aiBtn.addEventListener('click', function() {
      aiMode = !aiMode;
      aiBtn.textContent = `AI: ${aiMode ? 'ON  (you play White)' : 'OFF'}`;
      resetGame();
    });
  }

});