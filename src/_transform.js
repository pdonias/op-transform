const Component = require('./Component')

// Takes 2 lists of components and returns 2 lists of components that are the
// the result of their transformation
// op0, op1 => op0', op1' such that op1'(op0(D)) = op0'(op1(D))
module.exports = function _transform(...ops) {
  const results = [[], []]             // outputs 2 lists of components
  const cursors = [0, 0]               // input lists' cursors
  const comps = [ops[0][0], ops[1][0]] // next pair of components to transform

  const blocks = new Array(2)
  let jumpTo, rest
  // read: indexes of the operations that are consumed on this step
  // keep: index of the operations whose components are added to the result
  //       operations on this step. 2 means new retain operation.
  const step = (read, keep) => {
    jumpTo = Math.min(...read.map(i => comps[i].length))
    read.forEach(i => {
      [blocks[i], rest] = comps[i].split(jumpTo) // step forward as far as possible
      comps[i] = rest || ops[i][++cursors[i]]    // prepare the next components
    })
    keep.forEach((i, j) => {                     // push the resulting components
      results[j].push(blocks[i] || new Component({ type: 'ret', value: jumpTo }))
    })
  }

  let t0, t1
  while (t0 = comps[0]?.type, t1 = comps[1]?.type, t0 || t1) {
    if (!t0 && t1 !== 'ins') throw new Error('operation 0 is too short') // op1 can keep inserting at the end
    if (!t1 && t0 !== 'ins') throw new Error('operation 1 is too short') // op0 can keep inserting at the end

    if      (t0 === 'ret' && t1 === 'ret') step([0, 1], [0, 1]) // no changes
    else if (t0 === 'ins'                ) step([0   ], [0, 2]) // op0 has insertion priority
    else if (                t1 === 'ins') step([   1], [2, 1]) // 2 means new retain operation
    else if (t0 === 'del' && t1 === 'ret') step([0, 1], [0   ])
    else if (t0 === 'ret' && t1 === 'del') step([0, 1], [ , 1])
    else  /* t0 === 'del' && t1 === 'del'*/step([0, 1], [    ])
  }

  return results
}
